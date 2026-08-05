import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamText, tool, convertToModelMessages, stepCountIs } from 'ai';
import { createWorkersAI } from 'workers-ai-provider';
import { z } from 'zod';
import { SYSTEM_PROMPT } from '../../ui/src/lib/chat/schema-prompt';

type Bindings = {
  AI: Ai;
  CHAT_RATE_LIMITER: { limit(o: { key: string }): Promise<{ success: boolean }> };
  /** Must be a model the Workers AI catalog marks as function-calling capable. */
  AI_MODEL?: string;
  /** Extra browser origins, comma separated. */
  ALLOWED_ORIGINS?: string;
};

const DEFAULT_MODEL = '@cf/openai/gpt-oss-120b';

/**
 * Pinned origins. A suffix match on `.vercel.app` would let any site on that
 * shared domain through. CORS does not stop a non-browser client at all, which
 * is what the rate limit is for.
 */
const ORIGINS = ['http://localhost:5173', 'https://wakaru.vercel.app'];

const app = new Hono<{ Bindings: Bindings }>();

app.use('*', (c, next) =>
  cors({
    origin: (origin) =>
      origin && [...ORIGINS, ...(c.env.ALLOWED_ORIGINS ?? '').split(',')].includes(origin)
        ? origin
        : null,
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
    maxAge: 86400,
  })(c, next)
);

/**
 * Declared without an `execute`: the query runs in the browser against the
 * user's local database and the client sends back the result.
 */
const queryDatabase = tool({
  description: "Query the user's transaction ledger to answer their question",
  inputSchema: z.object({
    sql: z
      .string()
      .describe(
        'One read-only SELECT. amount_minor < 0 is money out, /100 for naira, ' +
          'and exclude internal transfers with transfer_group_id IS NULL.'
      ),
  }),
});

app.post('/api/chat', async (c) => {
  // Fail closed: skipping the limiter when the header is missing left an
  // unmetered path to the model.
  const ip = c.req.header('cf-connecting-ip');
  if (!ip) return c.json({ error: 'Could not identify client.' }, 400);

  const { success } = await c.env.CHAT_RATE_LIMITER.limit({ key: ip });
  if (!success) return c.json({ error: 'Rate limit exceeded. Try again shortly.' }, 429);

  const body = await c.req.json<{ messages?: unknown }>().catch(() => null);
  if (!Array.isArray(body?.messages) || body.messages.length === 0) {
    return c.json({ error: 'messages must be a non-empty array' }, 400);
  }

  const workersai = createWorkersAI({ binding: c.env.AI });

  const result = streamText({
    model: workersai((c.env.AI_MODEL ?? DEFAULT_MODEL) as Parameters<typeof workersai>[0]),
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(
      body.messages as Parameters<typeof convertToModelMessages>[0]
    ),
    tools: { queryDatabase },
    stopWhen: stepCountIs(5),
  });

  return result.toUIMessageStreamResponse();
});

app.get('/health', (c) => c.json({ model: c.env.AI_MODEL ?? DEFAULT_MODEL }));

export default app;
