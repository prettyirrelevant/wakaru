import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamText, tool, convertToModelMessages, stepCountIs } from 'ai';
import { createWorkersAI } from 'workers-ai-provider';
import { z } from 'zod';
import { SYSTEM_PROMPT } from '../../ui/src/lib/chat/schema-prompt';
import {
  MIN_CATEGORY_CONFIDENCE,
  type CategorizeAssignment,
  type CategorizeRequest,
} from '../../ui/src/lib/ai/categorize-prompt';

type Bindings = {
  AI: Ai;
  CHAT_RATE_LIMITER: { limit(o: { key: string }): Promise<{ success: boolean }> };
  CATEGORIZE_RATE_LIMITER: { limit(o: { key: string }): Promise<{ success: boolean }> };
  AI_MODEL?: string;
  CATEGORIZE_MODEL?: string;
  AI_GATEWAY_ID?: string;
  ALLOWED_ORIGINS?: string;
};

const DEFAULT_MODEL = '@cf/openai/gpt-oss-120b';
const DEFAULT_CATEGORIZE_MODEL = 'typesafe/jev';
const DEFAULT_GATEWAY_ID = 'default';

const app = new Hono<{ Bindings: Bindings }>();

app.use('*', (c, next) =>
  cors({
    origin: (origin) => {
      if (!origin) return null;
      if (origin === 'http://localhost:5173') return origin;
      if (origin.endsWith('.vercel.app')) return origin;
      if ((c.env.ALLOWED_ORIGINS ?? '').split(',').includes(origin)) return origin;
      return null;
    },
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

app.get('/health', (c) =>
  c.json({
    chatModel: c.env.AI_MODEL ?? DEFAULT_MODEL,
    categorizeModel: c.env.CATEGORIZE_MODEL ?? DEFAULT_CATEGORIZE_MODEL,
  })
);

const categorizeBodySchema = z.object({
  names: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        direction: z.enum(['in', 'out', 'both']),
      })
    )
    .min(1)
    .max(100),
  categories: z
    .array(z.object({ id: z.string().min(1).max(60), name: z.string().min(1).max(60) }))
    .min(1)
    .max(30),
});

const jevResultSchema = z.object({
  model: z.string().min(1),
  answers: z.record(
    z.object({
      type: z.literal('choice'),
      choice: z.string(),
      confidence: z.number().min(0).max(1),
    })
  ),
});

type JevResult = z.infer<typeof jevResultSchema>;

function buildJevInput(request: CategorizeRequest) {
  const counterparties = Object.fromEntries(
    request.names.map((candidate, index) => [`candidate_${index}`, candidate])
  );
  const criteria = Object.fromEntries([
    ...request.categories.map((category) => [category.id, category.name]),
    [
      'skip',
      `The name is ambiguous or no category is at least ${MIN_CATEGORY_CONFIDENCE * 100}% likely.`,
    ],
  ]);
  const questions = Object.fromEntries(
    request.names.map((_, index) => [
      `candidate_${index}`,
      {
        type: 'choice',
        instructions: [
          `Choose the best category for \`counterparties.candidate_${index}\`.`,
          'Use the direction as evidence.',
          'Treat a person as an individual transfer in the stated direction.',
          'Treat a payment app as a transfer unless the name clearly identifies a bill.',
          'Choose the most specific category. Choose skip when the evidence is ambiguous.',
        ],
        criteria,
      },
    ])
  );

  return { state: { counterparties }, questions };
}

function mapJevAssignments(request: CategorizeRequest, result: JevResult): CategorizeAssignment[] {
  const categoryIds = new Set(request.categories.map((category) => category.id));

  return request.names.flatMap((candidate, index) => {
    const answer = result.answers[`candidate_${index}`];
    if (
      !answer ||
      answer.type !== 'choice' ||
      answer.choice === 'skip' ||
      !categoryIds.has(answer.choice) ||
      !Number.isFinite(answer.confidence) ||
      answer.confidence < MIN_CATEGORY_CONFIDENCE
    ) {
      return [];
    }

    return [
      {
        name: candidate.name,
        categoryId: answer.choice,
        confidence: answer.confidence,
        model: result.model,
      },
    ];
  });
}

app.post('/api/categorize', async (c) => {
  const ip = c.req.header('cf-connecting-ip');
  if (!ip) return c.json({ error: 'Could not identify client.' }, 400);

  const { success } = await c.env.CATEGORIZE_RATE_LIMITER.limit({ key: ip });
  if (!success) return c.json({ error: 'Rate limit exceeded. Try again shortly.' }, 429);

  const body = await c.req.json().catch(() => null);
  const parsed = categorizeBodySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid body.' }, 400);
  }

  const request: CategorizeRequest = parsed.data;

  try {
    const model = c.env.CATEGORIZE_MODEL ?? DEFAULT_CATEGORIZE_MODEL;
    const response = await c.env.AI.run(model as never, buildJevInput(request) as never, {
      gateway: { id: c.env.AI_GATEWAY_ID ?? DEFAULT_GATEWAY_ID },
    });
    const result = jevResultSchema.parse(response);
    return c.json({ assignments: mapJevAssignments(request, result) });
  } catch (error) {
    // Keep the real cause visible: quota, a transient model error, or a
    // response that failed schema validation are all different problems.
    const message = error instanceof Error ? error.message : String(error);
    console.error('categorize failed:', message);
    return c.json({ error: `Model could not be reached. (${message})` }, 502);
  }
});

export default app;
