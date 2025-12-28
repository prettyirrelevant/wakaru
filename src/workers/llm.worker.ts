import * as Comlink from 'comlink';
import { pipeline } from '@huggingface/transformers';

type ProgressCallback = (progress: number, message: string) => void;

const MODEL_ID = 'HuggingFaceTB/SmolLM2-360M-Instruct';

// Use a simpler type to avoid TS2590 union complexity
type TextGenerator = (text: string | string[], options?: Record<string, unknown>) => Promise<unknown>;

let generator: TextGenerator | null = null;
let isLoading = false;
let loadError: string | null = null;

const SYSTEM_PROMPT = `Convert the question to JSON query. Output ONLY valid JSON.

Schema:
{"action":"sum|count|list|max|min|average","needsSemanticSearch":boolean,"semanticQuery":"search terms","filters":{"type":"inflow|outflow|all"}}

Rules:
- "total spending" → {"action":"sum","filters":{"type":"outflow"},"needsSemanticSearch":false}
- "total income" → {"action":"sum","filters":{"type":"inflow"},"needsSemanticSearch":false}
- "biggest expense" → {"action":"max","filters":{"type":"outflow"},"needsSemanticSearch":false}
- "how much on food" → {"action":"sum","filters":{"type":"outflow"},"needsSemanticSearch":true,"semanticQuery":"food restaurant groceries"}
- "transport spending" → {"action":"sum","filters":{"type":"outflow"},"needsSemanticSearch":true,"semanticQuery":"transport uber bolt taxi fuel"}

JSON only:`;

const llmApi = {
  async loadModel(onProgress?: ProgressCallback): Promise<boolean> {
    if (generator) return true;
    if (isLoading) return false;

    isLoading = true;
    loadError = null;

    try {
      onProgress?.(0, 'Loading AI model...');

      // Track download vs init phases
      let lastFile = '';
      let downloadComplete = false;

      // Cast to avoid TS2590: complex union type
      generator = await pipeline('text-generation', MODEL_ID, {
        progress_callback: (progress: { progress?: number; status?: string; file?: string; loaded?: number; total?: number }) => {
          // Handle different progress stages
          if (progress.status === 'initiate' && progress.file) {
            lastFile = progress.file;
            onProgress?.(downloadComplete ? 95 : 0, `Loading ${progress.file.split('/').pop()}...`);
          } else if (progress.status === 'download' && progress.file) {
            lastFile = progress.file;
          } else if (progress.status === 'progress' && progress.progress !== undefined) {
            // Individual file progress - cap at 90% to leave room for init
            const pct = Math.min(90, Math.round(progress.progress * 0.9));
            const fileName = lastFile.split('/').pop() || 'model';
            onProgress?.(pct, `Downloading ${fileName}...`);
          } else if (progress.status === 'done') {
            downloadComplete = true;
            onProgress?.(95, 'Initializing model...');
          } else if (progress.status === 'ready') {
            onProgress?.(100, 'AI ready');
          }
        },
      }) as unknown as TextGenerator;

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
    return generator !== null;
  },

  async getError(): Promise<string | null> {
    return loadError;
  },

  async generateQuery(userQuestion: string): Promise<string> {
    if (!generator) {
      throw new Error('AI not loaded');
    }

    const prompt = `${SYSTEM_PROMPT}\nQuestion: ${userQuestion}\nJSON:`;

    const result = await generator(prompt, {
      max_new_tokens: 100,
      temperature: 0.1,
      do_sample: false,
    });

    // Extract generated text - handle various output formats
    const output = Array.isArray(result) ? result[0] : result;
    let text = '';

    if (typeof output === 'string') {
      text = output;
    } else if (output && typeof output === 'object') {
      const obj = output as Record<string, unknown>;
      if ('generated_text' in obj) {
        const generated = obj.generated_text;
        // generated_text can be string or array of message objects
        if (typeof generated === 'string') {
          text = generated;
        } else if (Array.isArray(generated) && generated.length > 0) {
          const last = generated[generated.length - 1];
          text = typeof last === 'string' ? last : (last as { content?: string })?.content || '';
        }
      }
    }

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return jsonMatch ? jsonMatch[0] : '';
  },
};

Comlink.expose(llmApi);

export type LLMApi = typeof llmApi;
