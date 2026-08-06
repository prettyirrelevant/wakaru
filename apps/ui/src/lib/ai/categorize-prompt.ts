import { z } from 'zod';

/**
 * The categorisation prompt and schema, shared between the cloud worker and
 * the local-server path so the two cannot drift.
 *
 * What reaches the model is deliberately narrow: counterparty names, the
 * aggregate direction of money with each, and the category list. No amounts,
 * no dates, no balances, no account numbers.
 */

export type CategorizeDirection = 'in' | 'out' | 'both';

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

export const CATEGORIZE_SCHEMA = z.object({
  assignments: z
    .array(
      z.object({
        name: z.string().describe('exactly one of the names you were given'),
        categoryId: z.string().describe('one of the category ids you were given'),
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
- Map each name to exactly one category id. Include only names you are at least 90% sure about — a wrong category is worse than no category, so skip anything ambiguous.`;
}
