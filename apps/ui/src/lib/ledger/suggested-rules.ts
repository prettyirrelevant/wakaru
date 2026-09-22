import { generateObject } from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { ChatMode, Rule, SuggestedRulesOutcome } from '~/types';
import type { Queryable } from '~/lib/db';
import {
  deleteRule,
  getSetting,
  listCategories,
  listRules,
  normalizeCounterpartyName,
  setSetting,
} from '~/lib/db';
import { applyRules, sortRules } from './rules';
import { hashParts } from '~/lib/utils/hash';
import { PROXY_URL } from '~/lib/constants';
import {
  buildCategorizePrompt,
  CATEGORIZE_SCHEMA,
  type CategorizeAssignment,
  type CategorizeCandidate,
  type CategorizeRequest,
} from '~/lib/ai/categorize-prompt';

const REJECTED_KEY = 'rejectedSuggestions';
const MAX_SUGGEST_NAMES = 60;
const SUGGESTED_PRIORITY = 60;

interface RuleRowForReapply {
  id: string;
  description: string;
  counterpartyName: string | null;
  kind: string;
}

export async function collectUncategorizedCounterparties(
  db: Queryable
): Promise<CategorizeCandidate[]> {
  const result = await db.query<{ name: string; direction: string }>(`
    SELECT cp.canonical_name AS name,
           CASE
             WHEN MIN(t.amount_minor) < 0 AND MAX(t.amount_minor) > 0 THEN 'both'
             WHEN MAX(t.amount_minor) > 0 THEN 'in'
             ELSE 'out'
           END AS direction
    FROM transactions t
    JOIN counterparties cp ON cp.id = t.counterparty_id
    WHERE t.category_id IS NULL
      AND t.transfer_group_id IS NULL
      AND NOT cp.is_self
    GROUP BY cp.canonical_name
    ORDER BY COUNT(*) DESC, cp.canonical_name
  `);

  const rejected = new Set((await getSetting<string[]>(db, REJECTED_KEY)) ?? []);
  const seen = new Set<string>();
  const names: CategorizeCandidate[] = [];

  for (const row of result.rows) {
    const normalized = normalizeCounterpartyName(row.name);
    if (!normalized || normalized.length < 2 || rejected.has(normalized) || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    names.push({ name: row.name.trim(), direction: row.direction as CategorizeCandidate['direction'] });
    if (names.length >= MAX_SUGGEST_NAMES) break;
  }

  return names;
}

export async function suggestRuleAssignments(
  chatMode: ChatMode,
  request: CategorizeRequest
): Promise<CategorizeAssignment[]> {
  if (chatMode.type === 'cloud') {
    const response = await fetch(`${PROXY_URL}/api/categorize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(90_000),
    });
    if (!response.ok) throw new Error(`categorise proxy returned ${response.status}`);
    return CATEGORIZE_SCHEMA.parse(await response.json()).assignments;
  }

  if (chatMode.type === 'local' && chatMode.status === 'connected') {
    const provider = createOpenAICompatible({
      name: 'local',
      baseURL: chatMode.url,
      apiKey: 'not-needed',
    });
    const result = await generateObject({
      model: provider.chatModel(chatMode.model),
      schema: CATEGORIZE_SCHEMA,
      prompt: buildCategorizePrompt(request),
      abortSignal: AbortSignal.timeout(120_000),
    });
    return result.object.assignments;
  }

  throw new Error('ai categorisation is disabled');
}

export async function persistSuggestedRules(
  db: Queryable,
  assignments: CategorizeAssignment[]
): Promise<number> {
  if (assignments.length === 0) return 0;

  const categoryIds = new Set((await listCategories(db)).map((c) => c.id));
  const rejected = new Set((await getSetting<string[]>(db, REJECTED_KEY)) ?? []);
  const existing = new Set((await listRules(db)).map((r) => r.pattern));
  let persisted = 0;

  for (const assignment of assignments) {
    const pattern = assignment.name.trim().toLowerCase();
    if (!pattern || !categoryIds.has(assignment.categoryId)) continue;
    if (rejected.has(normalizeCounterpartyName(assignment.name))) continue;
    if (existing.has(pattern)) continue;
    existing.add(pattern);

    const id = `rule-sug-${hashParts(pattern, assignment.categoryId)}`;
    await db.query(
      `INSERT INTO rules (
         id, match_field, match_type, pattern, category_id, priority, source,
         suggestion_confidence, suggestion_model
       )
       VALUES ($1, 'counterparty', 'contains', $2, $3, $4, 'suggested', $5, $6)
       ON CONFLICT (id) DO NOTHING`,
      [
        id,
        pattern,
        assignment.categoryId,
        SUGGESTED_PRIORITY,
        assignment.confidence ?? null,
        assignment.model ?? null,
      ]
    );
    persisted++;
  }

  return persisted;
}

export async function reapplyRulesForRows(
  db: Queryable,
  rows: RuleRowForReapply[]
): Promise<number> {
  if (rows.length === 0) return 0;

  const rules = sortRules(await listRules(db));
  let categorized = 0;

  for (const row of rows) {
    const assignment = applyRules(rules, row);
    const categoryId = assignment?.categoryId ?? null;
    if (assignment) categorized++;
    await db.query(
      `UPDATE transactions SET category_id = $2, category_source = $3
       WHERE id = $1
         AND (category_id IS DISTINCT FROM $2 OR category_source IS DISTINCT FROM $3)`,
      [row.id, categoryId, assignment?.source ?? null]
    );
  }

  return categorized;
}

export async function applyRulesToUncategorized(db: Queryable): Promise<number> {
  const result = await db.query<RuleRowForReapply>(
    `SELECT t.id, t.description, t.kind, cp.canonical_name AS "counterpartyName"
     FROM transactions t
     LEFT JOIN counterparties cp ON cp.id = t.counterparty_id
     WHERE t.category_id IS NULL`
  );
  return reapplyRulesForRows(
    db,
    result.rows.map((r) => ({ ...r, counterpartyName: r.counterpartyName ?? null }))
  );
}

export async function approveSuggestedRule(db: Queryable, ruleId: string): Promise<void> {
  await db.query(`UPDATE rules SET source = 'user' WHERE id = $1 AND source = 'suggested'`, [
    ruleId,
  ]);
}

export async function rejectSuggestedRule(db: Queryable, ruleId: string): Promise<void> {
  const rules = await listRules(db);
  const rule: Rule | undefined = rules.find((r) => r.id === ruleId);
  if (!rule) return;

  await deleteRule(db, ruleId);

  const normalized = normalizeCounterpartyName(rule.pattern);
  if (normalized) {
    const rejected = (await getSetting<string[]>(db, REJECTED_KEY)) ?? [];
    if (!rejected.includes(normalized)) {
      await setSetting(db, REJECTED_KEY, [...rejected, normalized]);
    }
  }

  const result = await db.query<RuleRowForReapply>(
    `SELECT t.id, t.description, t.kind, cp.canonical_name AS "counterpartyName"
     FROM transactions t
     LEFT JOIN counterparties cp ON cp.id = t.counterparty_id
     WHERE t.category_source = 'rule'
       AND (cp.canonical_name ILIKE '%' || $1 || '%' OR t.description ILIKE '%' || $1 || '%')`,
    [rule.pattern]
  );

  await reapplyRulesForRows(
    db,
    result.rows.map((r) => ({ ...r, counterpartyName: r.counterpartyName ?? null }))
  );
}

export async function runSuggestionPass(
  db: Queryable,
  chatMode: ChatMode
): Promise<SuggestedRulesOutcome | null> {
  if (
    chatMode.type !== 'cloud' &&
    !(chatMode.type === 'local' && chatMode.status === 'connected')
  ) {
    return null;
  }

  const names = await collectUncategorizedCounterparties(db);
  if (names.length === 0) return null;

  const categories = await listCategories(db);
  const assignments = await suggestRuleAssignments(chatMode, { names, categories });

  const rules = await persistSuggestedRules(db, assignments);
  if (rules === 0) return { rules: 0, rows: 0 };

  const rows = await applyRulesToUncategorized(db);
  return { rules, rows };
}
