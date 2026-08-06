import {
  type ChatTransport,
  type UIMessageChunk,
  type ChatRequestOptions,
  type UIMessage,
  streamText,
  convertToModelMessages,
  createUIMessageStream,
  tool,
  stepCountIs,
} from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { z } from 'zod';
import { SYSTEM_PROMPT } from '~/lib/chat/schema-prompt';

export type ToolExecutor = (sql: string) => Promise<string>;

export class LocalServerTransport implements ChatTransport<UIMessage> {
  private readonly baseURL: string;
  private readonly modelId: string;
  private readonly executeQuery: ToolExecutor;

  constructor(baseURL: string, modelId: string, executeQuery: ToolExecutor) {
    this.baseURL = baseURL;
    this.modelId = modelId;
    this.executeQuery = executeQuery;
  }

  async sendMessages(
    options: {
      chatId: string;
      messages: UIMessage[];
      abortSignal: AbortSignal | undefined;
    } & {
      trigger: 'submit-message' | 'submit-tool-result' | 'regenerate-message';
      messageId: string | undefined;
    } & ChatRequestOptions
  ): Promise<ReadableStream<UIMessageChunk>> {
    const { messages, abortSignal } = options;
    const executeQuery = this.executeQuery;

    const provider = createOpenAICompatible({
      name: 'local',
      baseURL: this.baseURL,
      apiKey: 'not-needed',
    });

    return createUIMessageStream({
      execute: async ({ writer }) => {
        const prompt = await convertToModelMessages(messages);

        const result = streamText({
          model: provider.chatModel(this.modelId),
          system: SYSTEM_PROMPT,
          messages: prompt,
          abortSignal,
          tools: {
            queryDatabase: tool({
              description: 'Query the transactions database. Returns query results as text. You MUST call this tool to answer any question about spending, income, or transactions.',
              inputSchema: z.object({
                sql: z
                  .string()
                  .describe(
                    'A single read-only PostgreSQL SELECT over the transactions ledger. ' +
                      'Use amount_minor < 0 for money out, > 0 for money in, divide by 100 for naira, ' +
                      'and exclude internal transfers with transfer_group_id IS NULL.'
                  ),
              }),
              execute: async ({ sql }: { sql: string }) => {
                return executeQuery(sql);
              },
            }),
          },
          stopWhen: stepCountIs(5),
        });

        writer.merge(result.toUIMessageStream({ sendStart: false }));
      },
    });
  }

  async reconnectToStream(): Promise<ReadableStream<UIMessageChunk> | null> {
    return null;
  }
}

interface ModelInfo {
  id: string;
  name?: string;
}

interface ModelsResponse {
  data?: ModelInfo[];
  models?: ModelInfo[];
}

export async function fetchLocalServerModels(baseURL: string): Promise<{ ok: boolean; models?: string[]; error?: string }> {
  try {
    const response = await fetch(`${baseURL}/models`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    
    if (!response.ok) {
      return { ok: false, error: `server returned ${response.status}` };
    }

    const data: ModelsResponse = await response.json();
    
    // Handle both OpenAI format ({ data: [...] }) and Ollama format ({ models: [...] })
    const modelList = data.data || data.models || [];
    const models = modelList.map((m) => m.id || m.name).filter(Boolean) as string[];
    
    if (models.length === 0) {
      return { ok: false, error: 'no models found' };
    }
    
    return { ok: true, models };
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError' || error.name === 'TimeoutError') {
        return { ok: false, error: 'connection timed out' };
      }
      if (error.message.includes('Failed to fetch')) {
        return { ok: false, error: 'could not connect to server' };
      }
      return { ok: false, error: error.message };
    }
    return { ok: false, error: 'connection failed' };
  }
}
