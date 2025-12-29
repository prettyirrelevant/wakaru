import * as Comlink from 'comlink';
import { CreateMLCEngine, MLCEngine } from '@mlc-ai/web-llm';

type ProgressCallback = (progress: number, message: string) => void;

const MODEL_ID = 'Qwen2-0.5B-Instruct-q4f16_1-MLC';

let engine: MLCEngine | null = null;
let isLoading = false;
let loadError: string | null = null;

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

const llmApi = {
  async loadModel(onProgress?: ProgressCallback): Promise<boolean> {
    if (engine) return true;
    if (isLoading) return false;

    isLoading = true;
    loadError = null;

    try {
      onProgress?.(0, 'Checking WebGPU support...');

      if (!('gpu' in navigator)) {
        throw new Error('WebGPU not supported. Try Chrome or Edge.');
      }

      onProgress?.(0, 'Initializing WebGPU...');

      let lastProgress = 0;
      let lastText = '';

      engine = await CreateMLCEngine(MODEL_ID, {
        initProgressCallback: (report) => {
          const progress = Math.round(report.progress * 100);
          
          if (progress !== lastProgress || report.text !== lastText) {
            lastProgress = progress;
            lastText = report.text;
            
            let message = report.text;
            if (message.includes('Loading model from cache')) {
              message = 'Loading cached model...';
            } else if (message.includes('Fetching param cache')) {
              message = `Downloading model... ${progress}%`;
            } else if (message.includes('Loading GPU shader')) {
              message = 'Compiling GPU shaders (this takes a moment)...';
            } else if (message.includes('Finish loading')) {
              message = 'Finalizing...';
            }
            
            onProgress?.(progress, message);
          }
        },
      });

      onProgress?.(100, 'AI ready');
      isLoading = false;
      return true;
    } catch (error) {
      loadError = error instanceof Error ? error.message : 'Failed to load AI';
      isLoading = false;
      return false;
    }
  },

  async isReady(): Promise<boolean> {
    return engine !== null;
  },

  async getError(): Promise<string | null> {
    return loadError;
  },

  async generateSQL(question: string): Promise<string> {
    if (!engine) throw new Error('AI not loaded');

    await engine.resetChat();
    const response = await engine.chat.completions.create({
      messages: [
        { role: 'system', content: SQL_SYSTEM_PROMPT },
        { role: 'user', content: `Question: ${question}\n\nSQL:` },
      ],
      temperature: 0.1,
      max_tokens: 150,
    });

    const text = response.choices[0]?.message?.content || '';
    const sql = extractSQL(text);

    if (!sql) throw new Error('Could not generate SQL');
    return sql;
  },

  async generateAnswer(question: string, results: string): Promise<string> {
    if (!engine) throw new Error('AI not loaded');

    await engine.resetChat();
    const response = await engine.chat.completions.create({
      messages: [
        { role: 'system', content: ANSWER_SYSTEM_PROMPT },
        { role: 'user', content: `Question: ${question}\n\nResults:\n${results}` },
      ],
      temperature: 0.3,
      max_tokens: 100,
    });

    return response.choices[0]?.message?.content?.trim() || '';
  },
};

function extractSQL(text: string): string | null {
  const cleaned = text.trim();

  const codeBlockMatch = cleaned.match(/```(?:sql)?\s*([\s\S]*?)```/i);
  if (codeBlockMatch) return codeBlockMatch[1].trim();

  if (/^(SELECT|WITH)\s/i.test(cleaned)) {
    const match = cleaned.match(/^((?:SELECT|WITH)[\s\S]*?);?\s*$/i);
    return match ? match[1].trim() : cleaned;
  }

  const selectMatch = cleaned.match(/(SELECT[\s\S]*?)(?:;|$)/i);
  if (selectMatch) return selectMatch[1].trim();

  return null;
}

Comlink.expose(llmApi);

export type LLMApi = typeof llmApi;
