import type { QueryOutput } from '~/lib/db';
import { UnsafeSqlError } from '~/lib/db/readonly-sql';
import type { ChatMode } from '~/types';

export const PROXY_URL = 'https://wakaru-api.ienioladewumi.workers.dev';

export function formatValue(col: string, value: unknown): string {
  if (value === null || value === undefined) return 'none';

  const colLower = col.toLowerCase();
  const isMonetary =
    colLower.includes('amount') || colLower.includes('total') || colLower.includes('sum');

  if (isMonetary && typeof value === 'number') {
    return `₦${value.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  }

  if (colLower.includes('date') || colLower.endsWith('_at')) {
    const date = value instanceof Date ? value : typeof value === 'string' ? new Date(value) : null;
    if (date && !Number.isNaN(date.getTime())) {
      return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    }
  }

  return String(value);
}

export function formatResults(output: QueryOutput): string {
  if (output.rows.length === 0) return 'No results found';

  const lines = output.rows.map((row) =>
    output.columns.map((col, i) => `${col}: ${formatValue(col, row[i])}`).join(', ')
  );

  if (output.truncated) {
    lines.push('... more rows were returned than are shown; narrow the query if you need them.');
  }

  return lines.join('\n');
}

/**
 * Turn a failed query into something the model can act on. A rejected query
 * should read as a correctable mistake, not as a system error, so the model
 * retries with a valid SELECT instead of apologising to the user.
 */
export function formatQueryError(error: unknown): string {
  if (error instanceof UnsafeSqlError) {
    return `Query rejected: ${error.message} Rewrite it as a single read-only SELECT.`;
  }
  return `Error executing query: ${error instanceof Error ? error.message : 'Unknown error'}`;
}

export function getErrorMessage(error: Error | null | undefined, chatMode: ChatMode): string | null {
  if (!error) return null;

  const errorStr = error.message || String(error);

  if (errorStr.includes('rate_limit') || errorStr.includes('429')) {
    return "I'm getting a lot of requests right now! Please try again in a minute or two.";
  }

  if (errorStr.includes('service_unavailable') || errorStr.includes('503')) {
    return "I'm having trouble connecting right now. Please try again in a moment.";
  }

  if (errorStr.includes('Failed to fetch') || errorStr.includes('NetworkError')) {
    return chatMode.type === 'local'
      ? "Can't connect to your local server. Make sure it's running."
      : 'Connection failed. Check your internet connection.';
  }

  return 'Something went wrong. Please try again.';
}

export function getChatKey(chatMode: ChatMode): string {
  if (chatMode.type === 'cloud') return 'cloud';
  if (chatMode.type === 'local' && chatMode.status === 'connected') {
    return `local-${chatMode.url}-${chatMode.model}`;
  }
  return 'blocked';
}
