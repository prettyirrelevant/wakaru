/**
 * Transaction Query DSL
 * 
 * A simple DSL for querying transactions that an LLM can generate.
 * 
 * Query structure:
 * {
 *   "action": "sum" | "count" | "list" | "find" | "average" | "max" | "min",
 *   "filters": {
 *     "type": "inflow" | "outflow" | "all",
 *     "dateRange": { "start": "ISO date", "end": "ISO date" },
 *     "description": "search term",
 *     "minAmount": number,
 *     "maxAmount": number,
 *     "counterparty": "name"
 *   },
 *   "limit": number,
 *   "sort": { "field": "date" | "amount", "order": "asc" | "desc" }
 * }
 */

import type { Transaction } from '~/types';
import { TransactionCategory } from '~/types';

export interface QueryFilters {
  type?: 'inflow' | 'outflow' | 'all';
  dateRange?: { start?: string; end?: string };
  description?: string;
  minAmount?: number;
  maxAmount?: number;
  counterparty?: string;
  ids?: string[]; // Filter by specific transaction IDs (from semantic search)
}

export interface TransactionQuery {
  action: 'sum' | 'count' | 'list' | 'find' | 'average' | 'max' | 'min';
  needsSemanticSearch?: boolean;
  semanticQuery?: string;
  filters?: QueryFilters;
  limit?: number;
  sort?: { field: 'date' | 'amount'; order: 'asc' | 'desc' };
}

export interface QueryResult {
  success: boolean;
  data: {
    transactions?: Transaction[];
    value?: number;
    count?: number;
  };
  summary: string;
}

/**
 * Execute a DSL query against transactions
 */
export function executeQuery(query: TransactionQuery, transactions: Transaction[]): QueryResult {
  try {
    // Apply filters
    let filtered = filterTransactions(transactions, query.filters);
    
    // Apply sorting
    if (query.sort) {
      filtered = sortTransactions(filtered, query.sort);
    }
    
    // Execute action
    switch (query.action) {
      case 'sum':
        return sumTransactions(filtered);
      case 'count':
        return countTransactions(filtered);
      case 'average':
        return averageTransactions(filtered);
      case 'max':
        return maxTransaction(filtered);
      case 'min':
        return minTransaction(filtered);
      case 'list':
      case 'find':
        return listTransactions(filtered, query.limit ?? 10);
      default:
        return { success: false, data: {}, summary: 'Unknown action' };
    }
  } catch (error) {
    return { 
      success: false, 
      data: {}, 
      summary: `Query error: ${error instanceof Error ? error.message : 'Unknown error'}` 
    };
  }
}

function filterTransactions(transactions: Transaction[], filters?: QueryFilters): Transaction[] {
  if (!filters) return transactions;
  
  return transactions.filter(t => {
    // Filter by specific IDs (from semantic search)
    if (filters.ids && filters.ids.length > 0) {
      if (!filters.ids.includes(t.id)) return false;
    }
    
    // Filter by type (inflow/outflow)
    if (filters.type && filters.type !== 'all') {
      const isInflow = t.category === TransactionCategory.Inflow;
      if (filters.type === 'inflow' && !isInflow) return false;
      if (filters.type === 'outflow' && isInflow) return false;
    }
    
    // Filter by date range
    if (filters.dateRange) {
      const txDate = new Date(t.date);
      if (filters.dateRange.start && txDate < new Date(filters.dateRange.start)) return false;
      if (filters.dateRange.end && txDate > new Date(filters.dateRange.end)) return false;
    }
    
    // Filter by description (case-insensitive contains)
    if (filters.description) {
      const searchTerm = filters.description.toLowerCase();
      const desc = t.description.toLowerCase();
      const narration = t.meta?.narration?.toLowerCase() ?? '';
      if (!desc.includes(searchTerm) && !narration.includes(searchTerm)) return false;
    }
    
    // Filter by amount range (in kobo, so convert)
    const amountInNaira = Math.abs(t.amount) / 100;
    if (filters.minAmount !== undefined && amountInNaira < filters.minAmount) return false;
    if (filters.maxAmount !== undefined && amountInNaira > filters.maxAmount) return false;
    
    // Filter by counterparty
    if (filters.counterparty) {
      const searchTerm = filters.counterparty.toLowerCase();
      const counterparty = t.meta?.counterpartyName?.toLowerCase() ?? '';
      if (!counterparty.includes(searchTerm)) return false;
    }
    
    return true;
  });
}

function sortTransactions(
  transactions: Transaction[], 
  sort: { field: 'date' | 'amount'; order: 'asc' | 'desc' }
): Transaction[] {
  return [...transactions].sort((a, b) => {
    let comparison = 0;
    if (sort.field === 'date') {
      comparison = new Date(a.date).getTime() - new Date(b.date).getTime();
    } else {
      comparison = Math.abs(a.amount) - Math.abs(b.amount);
    }
    return sort.order === 'desc' ? -comparison : comparison;
  });
}

function formatAmount(amountInKobo: number): string {
  const naira = Math.abs(amountInKobo) / 100;
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(naira);
}

function sumTransactions(transactions: Transaction[]): QueryResult {
  const total = transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
  return {
    success: true,
    data: { value: total, count: transactions.length },
    summary: `Total: ${formatAmount(total)} across ${transactions.length} transaction${transactions.length !== 1 ? 's' : ''}`
  };
}

function countTransactions(transactions: Transaction[]): QueryResult {
  return {
    success: true,
    data: { count: transactions.length },
    summary: `Found ${transactions.length} transaction${transactions.length !== 1 ? 's' : ''}`
  };
}

function averageTransactions(transactions: Transaction[]): QueryResult {
  if (transactions.length === 0) {
    return { success: true, data: { value: 0, count: 0 }, summary: 'No transactions found' };
  }
  const total = transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
  const average = total / transactions.length;
  return {
    success: true,
    data: { value: average, count: transactions.length },
    summary: `Average: ${formatAmount(average)} across ${transactions.length} transaction${transactions.length !== 1 ? 's' : ''}`
  };
}

function maxTransaction(transactions: Transaction[]): QueryResult {
  if (transactions.length === 0) {
    return { success: true, data: {}, summary: 'No transactions found' };
  }
  const max = transactions.reduce((m, t) => Math.abs(t.amount) > Math.abs(m.amount) ? t : m);
  const date = new Date(max.date).toLocaleDateString('en-NG', { 
    day: 'numeric', month: 'short', year: 'numeric' 
  });
  return {
    success: true,
    data: { transactions: [max], value: Math.abs(max.amount) },
    summary: `Largest: ${formatAmount(max.amount)} on ${date} - ${max.description}`
  };
}

function minTransaction(transactions: Transaction[]): QueryResult {
  if (transactions.length === 0) {
    return { success: true, data: {}, summary: 'No transactions found' };
  }
  const min = transactions.reduce((m, t) => Math.abs(t.amount) < Math.abs(m.amount) ? t : m);
  const date = new Date(min.date).toLocaleDateString('en-NG', { 
    day: 'numeric', month: 'short', year: 'numeric' 
  });
  return {
    success: true,
    data: { transactions: [min], value: Math.abs(min.amount) },
    summary: `Smallest: ${formatAmount(min.amount)} on ${date} - ${min.description}`
  };
}

function listTransactions(transactions: Transaction[], limit: number): QueryResult {
  const limited = transactions.slice(0, limit);
  
  if (limited.length === 0) {
    return { success: true, data: { transactions: [] }, summary: 'No transactions found' };
  }
  
  const lines = limited.map(t => {
    const type = t.category === TransactionCategory.Inflow ? '+' : '-';
    const date = new Date(t.date).toLocaleDateString('en-NG', { 
      day: 'numeric', month: 'short' 
    });
    const desc = t.description.length > 35 ? t.description.slice(0, 35) + '...' : t.description;
    return `${type}${formatAmount(t.amount)} ${date} - ${desc}`;
  });
  
  const total = transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
  const header = transactions.length > limit 
    ? `Showing ${limit} of ${transactions.length} transactions:`
    : `Found ${transactions.length} transaction${transactions.length !== 1 ? 's' : ''}:`;
  
  return {
    success: true,
    data: { transactions: limited, count: transactions.length, value: total },
    summary: `${header}\n\n${lines.join('\n')}\n\nTotal: ${formatAmount(total)}`
  };
}

/**
 * Parse LLM output to extract JSON query
 */
export function parseQueryFromLLM(llmOutput: string): TransactionQuery | null {
  try {
    // Try to find JSON in the output
    const jsonMatch = llmOutput.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    
    const parsed = JSON.parse(jsonMatch[0]);
    
    // Validate required fields
    if (!parsed.action) return null;
    
    return parsed as TransactionQuery;
  } catch {
    return null;
  }
}
