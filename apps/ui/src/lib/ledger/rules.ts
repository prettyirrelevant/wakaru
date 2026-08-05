import type { CategorySource, Rule } from '~/types';

export interface Categorizable {
  description: string;
  counterpartyName?: string | null;
  kind: string;
}

export interface CategoryAssignment {
  categoryId: string;
  source: CategorySource;
}

function fieldValue(tx: Categorizable, field: Rule['matchField']): string {
  switch (field) {
    case 'description':
      return tx.description ?? '';
    case 'counterparty':
      return tx.counterpartyName ?? '';
    case 'kind':
      return tx.kind ?? '';
  }
}

function matches(rule: Rule, value: string): boolean {
  if (!value) return false;
  const haystack = value.toLowerCase();
  const needle = rule.pattern.toLowerCase();

  switch (rule.matchType) {
    case 'equals':
      return haystack === needle;
    case 'contains':
      return haystack.includes(needle);
    case 'regex':
      try {
        return new RegExp(rule.pattern, 'i').test(value);
      } catch {
        // A malformed user-authored pattern should not break categorisation
        // for every other transaction.
        return false;
      }
  }
}

/**
 * First match wins, lowest `priority` first. Rules are ordered by the caller;
 * this keeps the comparison itself pure so it can run over a whole import
 * without touching the database.
 */
export function applyRules(rules: Rule[], tx: Categorizable): CategoryAssignment | null {
  for (const rule of rules) {
    if (matches(rule, fieldValue(tx, rule.matchField))) {
      return { categoryId: rule.categoryId, source: 'rule' };
    }
  }
  return null;
}

/** Sort a rule set into evaluation order. */
export function sortRules(rules: Rule[]): Rule[] {
  return rules.slice().sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
}
