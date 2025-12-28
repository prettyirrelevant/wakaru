import { Hono } from 'hono';
import { cors } from 'hono/cors';

type Bindings = {
  AI: Ai;
  GOOGLE_AI_API_KEY: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// CORS configuration
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
];

app.use('*', cors({
  origin: (origin) => {
    if (!origin) return null;
    // Allow localhost ports
    if (ALLOWED_ORIGINS.includes(origin)) return origin;
    // Allow *.pages.dev
    if (origin.endsWith('.pages.dev')) return origin;
    return null;
  },
  allowMethods: ['POST', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
  maxAge: 86400,
}));

// Rate limiting - in-memory store (resets on worker restart, but good enough)
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 10; // requests per minute
const RATE_WINDOW = 60 * 1000; // 1 minute in ms

function checkRateLimit(ip: string): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const record = rateLimitStore.get(ip);
  
  if (!record || now > record.resetAt) {
    // New window
    rateLimitStore.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
    return { allowed: true, remaining: RATE_LIMIT - 1, resetAt: now + RATE_WINDOW };
  }
  
  if (record.count >= RATE_LIMIT) {
    return { allowed: false, remaining: 0, resetAt: record.resetAt };
  }
  
  record.count++;
  return { allowed: true, remaining: RATE_LIMIT - record.count, resetAt: record.resetAt };
}

// DSL system prompt
const SYSTEM_PROMPT = `You are a query parser that converts natural language questions about bank transactions into JSON queries. Output ONLY valid JSON, no other text.

JSON Schema:
{
  "action": "sum" | "count" | "list" | "max" | "min" | "average",
  "needsSemanticSearch": boolean,
  "semanticQuery": "search terms for finding relevant transactions",
  "filters": {
    "type": "inflow" | "outflow" | "all"
  }
}

Rules:
- "total spending" or "how much did I spend" → {"action":"sum","filters":{"type":"outflow"},"needsSemanticSearch":false}
- "total income" or "how much did I receive" → {"action":"sum","filters":{"type":"inflow"},"needsSemanticSearch":false}
- "biggest expense" or "largest purchase" → {"action":"max","filters":{"type":"outflow"},"needsSemanticSearch":false}
- "how much on food/transport/etc" → {"action":"sum","filters":{"type":"outflow"},"needsSemanticSearch":true,"semanticQuery":"relevant search terms"}
- "list transactions" or "show me" → {"action":"list","needsSemanticSearch":false}
- "how many transactions" → {"action":"count","needsSemanticSearch":false}
- "average spending" → {"action":"average","filters":{"type":"outflow"},"needsSemanticSearch":false}

For semantic queries, expand the search terms. Example:
- "food" → "food restaurant groceries supermarket eating"
- "transport" → "transport uber bolt taxi fuel petrol"
- "entertainment" → "entertainment netflix spotify cinema movies games"

Output JSON only:`;

// Provider: Cloudflare AI
async function generateWithCloudflare(ai: Ai, question: string): Promise<string> {
  const response = await ai.run('@cf/meta/llama-3.1-8b-instruct' as Parameters<typeof ai.run>[0], {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: question },
    ],
    max_tokens: 200,
    temperature: 0.1,
  } as Record<string, unknown>);
  
  // Extract response text
  const result = response as { response?: string };
  if (result.response && typeof result.response === 'string') {
    return result.response;
  }
  
  throw new Error('Unexpected Cloudflare AI response format');
}

// Provider: Google AI (Gemini)
async function generateWithGoogle(apiKey: string, question: string): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: `${SYSTEM_PROMPT}\n\nQuestion: ${question}` }]
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 200,
        },
      }),
    }
  );
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Google AI error: ${error}`);
  }
  
  const data = await response.json() as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };
  
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('No response from Google AI');
  }
  
  return text;
}

// Extract JSON from response
function extractJson(text: string): object | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

// Main chat endpoint
app.post('/api/chat', async (c) => {
  // Get client IP
  const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown';
  
  // Check rate limit
  const rateLimit = checkRateLimit(ip);
  
  // Set rate limit headers
  c.header('X-RateLimit-Limit', RATE_LIMIT.toString());
  c.header('X-RateLimit-Remaining', rateLimit.remaining.toString());
  c.header('X-RateLimit-Reset', Math.ceil(rateLimit.resetAt / 1000).toString());
  
  if (!rateLimit.allowed) {
    return c.json(
      { error: 'Rate limit exceeded. Try again later.' },
      429
    );
  }
  
  // Parse request
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
  
  if (question.length > 500) {
    return c.json({ error: 'Question too long (max 500 characters)' }, 400);
  }
  
  // Randomly pick provider (50/50)
  const useGoogle = Math.random() < 0.5 && c.env.GOOGLE_AI_API_KEY;
  const provider = useGoogle ? 'google' : 'cloudflare';
  
  console.log(`[chat] provider=${provider} question="${question.slice(0, 50)}${question.length > 50 ? '...' : ''}"`);
  
  try {
    let responseText: string;
    
    if (useGoogle) {
      responseText = await generateWithGoogle(c.env.GOOGLE_AI_API_KEY, question);
    } else {
      responseText = await generateWithCloudflare(c.env.AI, question);
    }
    
    console.log(`[chat] provider=${provider} success`);
    
    // Extract and validate JSON
    const query = extractJson(responseText);
    
    if (!query) {
      console.log(`[chat] provider=${provider} error="Failed to parse JSON"`);
      return c.json({ error: 'Failed to parse AI response' }, 500);
    }
    
    return c.json({ query, provider });
  } catch (error) {
    console.error(`[chat] provider=${provider} error:`, error);
    return c.json(
      { error: 'AI service temporarily unavailable' },
      503
    );
  }
});

// Health check
app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: Date.now() });
});

export default app;
