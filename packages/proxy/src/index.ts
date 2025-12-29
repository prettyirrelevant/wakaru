import { Hono } from 'hono';
import { cors } from 'hono/cors';

type Bindings = {
  AI: Ai;
  GOOGLE_AI_API_KEY: string;
};

type Provider = 'google' | 'cloudflare';

const app = new Hono<{ Bindings: Bindings }>();

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
];

app.use('*', cors({
  origin: (origin) => {
    if (!origin) return null;
    if (ALLOWED_ORIGINS.includes(origin)) return origin;
    if (origin.endsWith('.pages.dev')) return origin;
    return null;
  },
  allowMethods: ['POST', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
  maxAge: 86400,
}));

const SQL_SYSTEM_PROMPT = `You are a SQL query generator for a personal finance database. Convert natural language questions into SQLite queries.

Schema:
  Table: transactions
  Columns:
    - id: unique identifier
    - date: ISO timestamp (YYYY-MM-DDTHH:MM:SS) - use date(date) to extract calendar date for grouping
    - year, month (1-12), month_name (Jan-Dec), day (1-31)
    - description, narration: transaction details
    - amount: value in kobo
    - amount_naira: value in naira (always positive)
    - is_inflow: 1 = money received, 0 = money spent
    - category, transaction_type
    - bank_source: user's bank
    - counterparty, counterparty_bank: other party info
    - reference: transaction reference

Query rules:
1. Return ONLY the raw SQL query, no explanation or markdown
2. Use amount_naira for all monetary calculations (it's always positive)
3. Use is_inflow=0 for spending/expenses/sent/debits
4. Use is_inflow=1 for income/received/credits
5. Alias aggregates clearly: SUM(amount_naira) AS total_amount, COUNT(*) AS transaction_count
6. For "most/biggest/highest" queries: ORDER BY ... DESC LIMIT 1
7. For "least/smallest/lowest" queries: ORDER BY ... ASC LIMIT 1
8. For "what day" or "when" questions: SELECT date(date) AS calendar_date, GROUP BY date(date) if aggregating
9. For "which month" questions: include both month_name and year
10. Use LIKE with % wildcards for partial text matching (case-insensitive with LOWER())
11. For date ranges: use date BETWEEN 'YYYY-MM-DD' AND 'YYYY-MM-DD'
12. Default to current year if no year specified and query is time-bound

Examples:
  "how much did I spend in January?" → SELECT SUM(amount_naira) AS total_amount FROM transactions WHERE month = 1 AND is_inflow = 0
  "biggest transaction this year" → SELECT * FROM transactions WHERE year = strftime('%Y', 'now') ORDER BY amount_naira DESC LIMIT 1
  "who did I send money to most?" → SELECT counterparty, SUM(amount_naira) AS total_amount FROM transactions WHERE is_inflow = 0 AND counterparty IS NOT NULL GROUP BY counterparty ORDER BY total_amount DESC LIMIT 1
  "what day did I spend the most?" → SELECT date(date) AS calendar_date, SUM(amount_naira) AS total_amount FROM transactions WHERE is_inflow = 0 GROUP BY date(date) ORDER BY total_amount DESC LIMIT 1`;

const ANSWER_SYSTEM_PROMPT = `You are a friendly financial assistant. Given the user's question and the SQL query results, provide a clear, direct answer.

Response guidelines:
1. Answer the question in 1-2 sentences
2. Format money as ₦X,XXX.XX (naira with commas, include kobo only if non-zero)
3. Format dates naturally: "January 15th, 2024" not "2024-01-15"
4. For empty results: say you couldn't find matching transactions, suggest checking the criteria
5. For lists: present the top items clearly, mention if there are more
6. Round percentages to one decimal place
7. Use a conversational but informative tone

Handle edge cases:
- If total is 0 or null: "you didn't have any [spending/income] matching that criteria"
- If asking about a counterparty with no results: "I couldn't find any transactions with [name]"
- If the query returned multiple rows for a "most/biggest" question: focus on the top result

Do not:
- Mention SQL, queries, or databases
- Show raw column names
- Repeat the question back unnecessarily`;

async function generateWithCloudflare(ai: Ai, prompt: string, maxTokens = 300): Promise<string> {
  const response = await ai.run(
    '@cf/meta/llama-3.1-8b-instruct' as Parameters<typeof ai.run>[0],
    { messages: [{ role: 'user', content: prompt }], max_tokens: maxTokens, temperature: 0.1 } as Record<string, unknown>
  );

  const result = response as { response?: string };
  if (result.response && typeof result.response === 'string') {
    return result.response;
  }

  throw new Error('Unexpected Cloudflare AI response format');
}

async function generateWithGoogle(apiKey: string, prompt: string, maxTokens = 300): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: maxTokens },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Google AI error: ${await response.text()}`);
  }

  const data = await response.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('No response from Google AI');
  }

  return text;
}

async function generate(
  provider: Provider,
  ai: Ai,
  googleApiKey: string,
  prompt: string,
  maxTokens = 300
): Promise<string> {
  return provider === 'google'
    ? generateWithGoogle(googleApiKey, prompt, maxTokens)
    : generateWithCloudflare(ai, prompt, maxTokens);
}

function getProviders(): Provider[] {
  return Math.random() < 0.5 ? ['google', 'cloudflare'] : ['cloudflare', 'google'];
}

function extractSQL(text: string): string | null {
  const cleaned = text.trim();
  
  // Try to find SQL in code blocks
  const codeBlockMatch = cleaned.match(/```(?:sql)?\s*([\s\S]*?)```/i);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }
  
  // Check if the response starts with SELECT/WITH
  if (/^(SELECT|WITH)\s/i.test(cleaned)) {
    // Take everything up to a semicolon or end
    const match = cleaned.match(/^((?:SELECT|WITH)[\s\S]*?);?\s*$/i);
    return match ? match[1].trim() : cleaned;
  }
  
  return null;
}

// Generate SQL from question
app.post('/api/sql', async (c) => {
  let question: string;
  try {
    const body = await c.req.json<{ question?: string }>();
    question = body.question?.trim() || '';
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  if (!question) {
    return c.json({ error: 'Question is required' }, 400);
  }

  const prompt = `${SQL_SYSTEM_PROMPT}\n\nQuestion: ${question}\n\nSQL:`;
  const providers = getProviders();
  let lastError: Error | null = null;

  for (const provider of providers) {
    try {
      const response = await generate(provider, c.env.AI, c.env.GOOGLE_AI_API_KEY, prompt, 200);
      const sql = extractSQL(response);
      
      if (!sql) {
        throw new Error('Could not extract SQL from response');
      }
      
      return c.json({ sql, provider });
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  console.error('[sql] all providers failed:', lastError);
  return c.json({ error: 'Could not generate SQL query' }, 503);
});

// Generate answer from question + results
app.post('/api/answer', async (c) => {
  let question: string;
  let results: string;
  try {
    const body = await c.req.json<{ question?: string; results?: string }>();
    question = body.question?.trim() || '';
    results = body.results?.trim() || '';
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  if (!question || !results) {
    return c.json({ error: 'Question and results are required' }, 400);
  }

  const prompt = `${ANSWER_SYSTEM_PROMPT}\n\nQuestion: ${question}\n\nQuery Results:\n${results}\n\nAnswer:`;
  const providers = getProviders();
  let lastError: Error | null = null;

  for (const provider of providers) {
    try {
      const response = await generate(provider, c.env.AI, c.env.GOOGLE_AI_API_KEY, prompt, 150);
      return c.json({ answer: response.trim(), provider });
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  console.error('[answer] all providers failed:', lastError);
  return c.json({ error: 'Could not generate answer' }, 503);
});

app.get('/health', (c) => c.json({ status: 'ok', timestamp: Date.now() }));

export default app;
