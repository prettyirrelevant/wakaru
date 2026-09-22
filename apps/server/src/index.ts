import {
  convertToModelMessages,
  experimental_evaluate as evaluate,
  stepCountIs,
  streamText,
  tool,
  type Experimental_EvaluationQuestion,
} from 'ai';
import { z } from 'zod';
import {
  MIN_CATEGORY_CONFIDENCE,
  type CategorizeAssignment,
  type CategorizeRequest,
} from '@wakaru/shared/categorize';
import { SYSTEM_PROMPT } from '@wakaru/shared/chat';

const CHAT_MODEL = process.env.AI_MODEL ?? 'inclusionai/ling-3.0-flash-fin';
const CATEGORIZE_MODEL = process.env.CATEGORIZE_MODEL ?? 'typesafe-ai/jev';

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

function json(body: unknown, status = 200, headers?: HeadersInit) {
  return Response.json(body, { status, headers });
}

function rejectMethod(method: string, allowed: string) {
  if (method === allowed) return null;
  return json({ error: 'Method not allowed.' }, 405, { Allow: allowed });
}

function buildEvaluation(request: CategorizeRequest) {
  const counterparties = Object.fromEntries(
    request.names.map((candidate, index) => [
      `candidate_${index}`,
      { name: candidate.name, direction: candidate.direction },
    ])
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
        type: 'choice' as const,
        instructions: [
          `Choose the best category for \`counterparties.candidate_${index}\`.`,
          'Use the direction as evidence.',
          'Treat a person as an individual transfer in the stated direction.',
          'Treat a payment app as a transfer unless the name clearly identifies a bill.',
          'Choose the most specific category. Choose skip when the evidence is ambiguous.',
        ].join(' '),
        criteria,
      },
    ])
  ) as Record<string, Experimental_EvaluationQuestion>;

  return { state: { counterparties }, questions };
}

function mapAssignments(
  request: CategorizeRequest,
  answers: Awaited<ReturnType<typeof evaluate>>['answers'],
  model: string
): CategorizeAssignment[] {
  const categoryIds = new Set(request.categories.map((category) => category.id));

  return request.names.flatMap((candidate, index) => {
    const answer = answers[`candidate_${index}`];
    if (!answer || answer.type !== 'choice' || answer.choice === 'skip') return [];

    const confidence = answer.probabilities?.[answer.choice] ?? 0;
    if (!categoryIds.has(answer.choice) || confidence < MIN_CATEGORY_CONFIDENCE) return [];

    return [
      {
        name: candidate.name,
        categoryId: answer.choice,
        confidence,
        model,
      },
    ];
  });
}

export async function handleChat(request: Request) {
  const methodError = rejectMethod(request.method, 'POST');
  if (methodError) return methodError;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || !('messages' in body) || !Array.isArray(body.messages)) {
    return json({ error: 'messages must be a non-empty array' }, 400);
  }
  if (body.messages.length === 0) {
    return json({ error: 'messages must be a non-empty array' }, 400);
  }

  const result = streamText({
    model: CHAT_MODEL,
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(body.messages),
    tools: { queryDatabase },
    stopWhen: stepCountIs(5),
  });

  return result.toUIMessageStreamResponse();
}

export async function handleCategorize(request: Request) {
  const methodError = rejectMethod(request.method, 'POST');
  if (methodError) return methodError;

  const parsed = categorizeBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: 'Invalid body.' }, 400);

  try {
    const evaluation = buildEvaluation(parsed.data);
    const result = await evaluate({
      model: CATEGORIZE_MODEL,
      state: evaluation.state,
      questions: evaluation.questions,
    });
    return json({
      assignments: mapAssignments(parsed.data, result.answers, result.response.modelId),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('categorize failed:', message);
    return json({ error: `Model could not be reached. (${message})` }, 502);
  }
}

export function handleHealth(request: Request) {
  const methodError = rejectMethod(request.method, 'GET');
  if (methodError) return methodError;
  return json({ chatModel: CHAT_MODEL, categorizeModel: CATEGORIZE_MODEL });
}
