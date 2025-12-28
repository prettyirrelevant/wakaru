import type { Transaction } from '~/types';
import { TransactionCategory } from '~/types';
import { formatCurrency } from '~/lib/utils';

export interface SemanticSearchResult {
  transaction: Transaction;
  score: number;
}

type QueryIntent = 'total' | 'count' | 'largest' | 'smallest' | 'recent' | 'list' | 'find';

/**
 * Detect query intent from natural language
 */
function detectQueryIntent(query: string): QueryIntent {
  const q = query.toLowerCase();
  
  if (q.includes('total') || q.includes('sum') || q.includes('how much') || q.includes('spent on') || q.includes('spend on')) {
    return 'total';
  }
  if (q.includes('how many') || q.includes('count') || q.includes('number of')) {
    return 'count';
  }
  if (q.includes('largest') || q.includes('biggest') || q.includes('highest') || q.includes('most expensive')) {
    return 'largest';
  }
  if (q.includes('smallest') || q.includes('lowest') || q.includes('cheapest') || q.includes('least')) {
    return 'smallest';
  }
  if (q.includes('recent') || q.includes('latest') || q.includes('last')) {
    return 'recent';
  }
  if (q.includes('find') || q.includes('show') || q.includes('list') || q.includes('what')) {
    return 'list';
  }
  
  return 'find';
}

/**
 * Check if query is asking about spending (outflow)
 */
function isSpendingQuery(query: string): boolean {
  const q = query.toLowerCase();
  return q.includes('spend') || q.includes('spent') || q.includes('paid') || q.includes('bought') || q.includes('expense');
}

/**
 * Check if query is asking about income (inflow)
 */
function isIncomeQuery(query: string): boolean {
  const q = query.toLowerCase();
  return q.includes('receive') || q.includes('income') || q.includes('earn') || q.includes('got') || q.includes('inflow');
}

/**
 * Format date for display
 */
function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-NG', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Format a transaction for display
 */
function formatTransaction(t: Transaction): string {
  const type = t.category === TransactionCategory.Inflow ? '+' : '-';
  const date = formatDate(t.date);
  const desc = t.description.length > 40 ? t.description.slice(0, 40) + '...' : t.description;
  return `${type}${formatCurrency(Math.abs(t.amount))} on ${date}: ${desc}`;
}

/**
 * Format search results into a natural language response
 */
export function formatSemanticResults(
  query: string,
  results: SemanticSearchResult[],
  _allTransactions: Transaction[]
): string {
  if (results.length === 0) {
    return "no matching transactions found. try a different query.";
  }

  const intent = detectQueryIntent(query);
  
  // Filter by spending/income if query specifies
  let filteredResults = results;
  if (isSpendingQuery(query)) {
    filteredResults = results.filter(r => r.transaction.category === TransactionCategory.Outflow);
  } else if (isIncomeQuery(query)) {
    filteredResults = results.filter(r => r.transaction.category === TransactionCategory.Inflow);
  }

  if (filteredResults.length === 0) {
    return "no matching transactions found for that category.";
  }

  switch (intent) {
    case 'total': {
      const total = filteredResults.reduce((sum, r) => sum + Math.abs(r.transaction.amount), 0);
      const count = filteredResults.length;
      return `total: ${formatCurrency(total)} across ${count} transaction${count !== 1 ? 's' : ''}`;
    }
    
    case 'count': {
      return `found ${filteredResults.length} matching transaction${filteredResults.length !== 1 ? 's' : ''}`;
    }
    
    case 'largest': {
      const sorted = [...filteredResults].sort(
        (a, b) => Math.abs(b.transaction.amount) - Math.abs(a.transaction.amount)
      );
      const largest = sorted[0];
      return `largest: ${formatTransaction(largest.transaction)}`;
    }
    
    case 'smallest': {
      const sorted = [...filteredResults].sort(
        (a, b) => Math.abs(a.transaction.amount) - Math.abs(b.transaction.amount)
      );
      const smallest = sorted[0];
      return `smallest: ${formatTransaction(smallest.transaction)}`;
    }
    
    case 'recent': {
      const sorted = [...filteredResults].sort(
        (a, b) => new Date(b.transaction.date).getTime() - new Date(a.transaction.date).getTime()
      );
      const recent = sorted.slice(0, 5);
      const lines = recent.map(r => `• ${formatTransaction(r.transaction)}`);
      return `recent matches:\n\n${lines.join('\n')}`;
    }
    
    case 'list':
    case 'find':
    default: {
      const topResults = filteredResults.slice(0, 5);
      const lines = topResults.map(r => `• ${formatTransaction(r.transaction)}`);
      const total = filteredResults.reduce((sum, r) => sum + Math.abs(r.transaction.amount), 0);
      
      const header = filteredResults.length > 5
        ? `found ${filteredResults.length} matches (showing top 5):`
        : `found ${filteredResults.length} match${filteredResults.length !== 1 ? 'es' : ''}:`;
      
      return `${header}\n\n${lines.join('\n')}\n\ntotal: ${formatCurrency(total)}`;
    }
  }
}

/**
 * Process semantic search results with query understanding
 */
export function processSemanticQuery(
  query: string,
  semanticResults: SemanticSearchResult[],
  allTransactions: Transaction[]
): string {
  // Use a lower threshold for matching - 0.25 is reasonable for semantic similarity
  const relevantResults = semanticResults.filter((r) => r.score >= 0.25);

  if (relevantResults.length > 0) {
    return formatSemanticResults(query, relevantResults, allTransactions);
  }

  // If semantic search found nothing useful, return a helpful message
  return "no matching transactions found. try searching for specific merchants, descriptions, or categories.";
}
