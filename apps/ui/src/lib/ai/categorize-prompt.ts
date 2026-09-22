import { z } from 'zod';

export type CategorizeDirection = 'in' | 'out' | 'both';
export const MIN_CATEGORY_CONFIDENCE = 0.9;

export interface CategorizeCandidate {
  name: string;
  direction: CategorizeDirection;
}

export interface CategorizeCategory {
  id: string;
  name: string;
}

export interface CategorizeRequest {
  names: CategorizeCandidate[];
  categories: CategorizeCategory[];
}

export interface CategorizeAssignment {
  name: string;
  categoryId: string;
  confidence?: number;
  model?: string;
}

export const CATEGORIZE_SCHEMA = z.object({
  assignments: z
    .array(
      z.object({
        name: z.string().describe('exactly one of the names you were given'),
        categoryId: z.string().describe('one of the category ids you were given'),
        confidence: z.number().min(0).max(1).optional(),
        model: z.string().optional(),
      })
    )
    .describe('only the names you are confident about; omit everything else'),
});

export function buildCategorizePrompt({ names, categories }: CategorizeRequest): string {
  const nameLines = names
    .map((n) => `- ${n.name} (mostly money ${n.direction})`)
    .join('\n');
  const categoryLines = categories.map((c) => `- ${c.id}: ${c.name}`).join('\n');

  return `You are classifying merchant and person names from a Nigerian bank statement into spending categories.

## Categories
${categoryLines}

## Names
"mostly money in" is someone who sends the user money, "mostly money out" is someone the user pays, "both" goes both ways.
${nameLines}

## Rules
- A person's name is an individual transfer: Transfers in / Transfers out, following the direction hint.
- Wallets and payment apps (Opay, PalmPay, Paga, Moniepoint, Kuda) are stored value, not spending: Transfers out, unless the name is clearly a bill.
- Pick the most specific category available (a child category over its parent).
- Map each name to exactly one category id. Include only names you are at least ${MIN_CATEGORY_CONFIDENCE * 100}% sure about. Skip anything ambiguous.`;
}
