/**
 * Guard for model-authored SQL.
 *
 * The chat feature lets an LLM write queries that we execute against the
 * user's ledger. "Only use SELECT" in a system prompt is not a control: the
 * tool results we feed back to the model include transaction descriptions,
 * and those are written by whoever sent the user money. Treat every query as
 * attacker-influenced and enforce read-only in code.
 */

export class UnsafeSqlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeSqlError';
  }
}

/**
 * Statement keywords that must never appear, checked after string literals
 * and comments are removed so a search for '%update%' is not mistaken for an
 * UPDATE. Covers data-modifying CTEs, which are legal after a leading WITH.
 */
const FORBIDDEN = new RegExp(
  '\\b(' +
    [
      'insert', 'update', 'delete', 'merge', 'truncate', 'drop', 'alter',
      'create', 'grant', 'revoke', 'copy', 'vacuum', 'analyze', 'reindex',
      'cluster', 'call', 'do', 'execute', 'prepare', 'deallocate', 'listen',
      'notify', 'unlisten', 'lock', 'refresh', 'reset', 'discard', 'comment',
      'begin', 'commit', 'rollback', 'savepoint', 'checkpoint', 'import',
      'security',
    ].join('|') +
    ')\\b',
  'i'
);

/** `SET` is forbidden, but `SET` also appears inside `OFFSET`; match it alone. */
const FORBIDDEN_SET = /(^|[^a-z_])set\b/i;

/** Functions that read or write outside the query's own result set. */
const FORBIDDEN_FUNCTIONS =
  /\b(pg_read_file|pg_read_binary_file|pg_ls_dir|pg_stat_file|lo_import|lo_export|dblink|pg_sleep|pg_terminate_backend|pg_cancel_backend|set_config|current_setting)\s*\(/i;

function stripComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n\r]*/g, ' ');
}

function stripStringLiterals(sql: string): string {
  return sql
    .replace(/\$([A-Za-z_]\w*)?\$[\s\S]*?\$\1?\$/g, "''") // dollar-quoted
    .replace(/'(?:''|[^'])*'/g, "''") // single-quoted, doubled escapes
    .replace(/"(?:""|[^"])*"/g, '""'); // quoted identifiers
}

/**
 * Validate and normalise a model-authored query.
 *
 * @returns the query with comments removed and any trailing semicolon dropped
 * @throws UnsafeSqlError when the query is anything other than one read-only
 *   SELECT (or WITH ... SELECT)
 */
export function assertReadOnlySelect(sql: string): string {
  if (typeof sql !== 'string' || !sql.trim()) {
    throw new UnsafeSqlError('Query was empty.');
  }

  const withoutComments = stripComments(sql).trim();
  const normalized = withoutComments.replace(/;\s*$/, '').trim();

  if (!normalized) {
    throw new UnsafeSqlError('Query was empty.');
  }

  const scannable = stripStringLiterals(normalized);

  if (scannable.includes(';')) {
    throw new UnsafeSqlError('Only a single statement may be run.');
  }

  if (!/^(select|with)\b/i.test(scannable)) {
    throw new UnsafeSqlError('Only SELECT queries may be run.');
  }

  const forbidden = scannable.match(FORBIDDEN);
  if (forbidden) {
    throw new UnsafeSqlError(`"${forbidden[1].toUpperCase()}" is not allowed here.`);
  }

  if (FORBIDDEN_SET.test(scannable)) {
    throw new UnsafeSqlError('"SET" is not allowed here.');
  }

  if (FORBIDDEN_FUNCTIONS.test(scannable)) {
    throw new UnsafeSqlError('That function is not allowed here.');
  }

  return normalized;
}

/** Cap on rows handed back to the model, applied after the query runs. */
export const MAX_MODEL_ROWS = 50;
