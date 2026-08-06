import { buildScopeClause, buildWhereClause, type FilterState } from '~/lib/filters';

export interface PreparedQuery {
  sql: string;
  params: (string | number | boolean)[];
}

const FROM = 'FROM transactions t JOIN accounts a ON a.id = t.account_id';

function prepare(filters: FilterState, search: string, body: (where: string) => string): PreparedQuery {
  const where = buildWhereClause(filters, search);
  return { sql: body(where.sql), params: where.params };
}

/**
 * Headline figures. Fee rows count toward outflow and are also totalled
 * separately — the money left the account either way.
 */
export function summaryQuery(filters: FilterState, search: string): PreparedQuery {
  return prepare(
    filters,
    search,
    (where) => `
    SELECT
      COALESCE(SUM(CASE WHEN t.amount_minor > 0 THEN t.amount_minor ELSE 0 END), 0)      AS inflow,
      COALESCE(SUM(CASE WHEN t.amount_minor < 0 THEN -t.amount_minor ELSE 0 END), 0)     AS outflow,
      COALESCE(SUM(CASE WHEN t.kind = 'bank_charge' AND t.amount_minor < 0
                        THEN -t.amount_minor ELSE 0 END), 0)                             AS fees,
      COUNT(*)                                                                           AS count,
      MIN(t.booked_at)                                                                   AS min_date,
      MAX(t.booked_at)                                                                   AS max_date
    ${FROM}
    WHERE ${where}
  `
  );
}

/** Money the user moved between their own accounts, shown so it can be trusted. */
export function internalTransferQuery(filters: FilterState, search: string): PreparedQuery {
  const withInternal: FilterState = { ...filters, excludeInternal: false };
  const where = buildWhereClause(withInternal, search);
  return {
    sql: `
      SELECT
        COUNT(DISTINCT t.transfer_group_id)                                          AS groups,
        COALESCE(SUM(CASE WHEN t.amount_minor < 0 THEN -t.amount_minor ELSE 0 END), 0) AS amount
      ${FROM}
      WHERE ${where.sql} AND t.transfer_group_id IS NOT NULL
    `,
    params: where.params,
  };
}

export function monthlyFlowQuery(filters: FilterState, search: string): PreparedQuery {
  return prepare(
    filters,
    search,
    (where) => `
    SELECT
      TO_CHAR(t.booked_at, 'YYYY-MM')                                                AS month,
      COALESCE(SUM(CASE WHEN t.amount_minor > 0 THEN t.amount_minor ELSE 0 END), 0)  AS inflow,
      COALESCE(SUM(CASE WHEN t.amount_minor < 0 THEN -t.amount_minor ELSE 0 END), 0) AS outflow
    ${FROM}
    WHERE ${where}
    GROUP BY 1
    ORDER BY 1 ASC
  `
  );
}

export function categorySpendQuery(filters: FilterState, search: string): PreparedQuery {
  return prepare(
    filters,
    search,
    (where) => `
    SELECT
      t.category_id                          AS category_id,
      COALESCE(c.name, 'Uncategorized')      AS category_name,
      SUM(-t.amount_minor)                   AS amount,
      COUNT(*)                               AS count
    ${FROM}
    LEFT JOIN categories c ON c.id = t.category_id
    WHERE ${where} AND t.amount_minor < 0
    GROUP BY 1, 2
    ORDER BY amount DESC
  `
  );
}

export function topCounterpartiesQuery(
  filters: FilterState,
  search: string,
  direction: 'out' | 'in' = 'out'
): PreparedQuery {
  const sign = direction === 'out' ? '<' : '>';
  const magnitude = direction === 'out' ? '-t.amount_minor' : 't.amount_minor';

  return prepare(
    filters,
    search,
    (where) => `
    SELECT
      t.counterparty_id                                  AS counterparty_id,
      COALESCE(cp.canonical_name, t.description)         AS name,
      SUM(${magnitude})                                  AS amount,
      COUNT(*)                                           AS count
    ${FROM}
    LEFT JOIN counterparties cp ON cp.id = t.counterparty_id
    WHERE ${where} AND t.amount_minor ${sign} 0
    GROUP BY 1, 2
    ORDER BY amount DESC
    LIMIT 10
  `
  );
}

/**
 * Closing balance per account per day.
 *
 * Summing across accounts needs each account's last known balance carried
 * forward over days it had no activity, which is done in the caller — the
 * shape here stays small (days x accounts) and the carry-forward is clearer
 * in code than as a window function.
 */
export function dailyBalanceQuery(filters: FilterState): PreparedQuery {
  const scope = buildScopeClause(filters);
  return {
    params: scope.params,
    sql: `
    SELECT DISTINCT ON (t.account_id, (t.booked_at AT TIME ZONE 'UTC')::date)
      t.account_id                              AS account_id,
      (t.booked_at AT TIME ZONE 'UTC')::date    AS day,
      t.balance_after_minor                     AS closing
    ${FROM}
    WHERE ${scope.sql} AND t.balance_after_minor IS NOT NULL
    ORDER BY t.account_id, day, t.booked_at DESC, t.seq DESC
  `,
  };
}

/**
 * Strip the varying part of a description so repeats of the same payment
 * collapse: references, card digits and trailing numbers differ every time.
 */
const RECURRING_KEY =
  "INITCAP(TRIM(REGEXP_REPLACE(t.description, '[0-9]{3,}|[0-9]+\\.[0-9]+', '', 'g')))";

/** Recurring payments: same counterparty, steady amount, roughly monthly. */
export function recurringQuery(filters: FilterState, search: string): PreparedQuery {
  return prepare(
    filters,
    search,
    (where) => `
    SELECT
      COALESCE(cp.canonical_name, ${RECURRING_KEY}) AS name,
      COUNT(*)                                      AS occurrences,
      ROUND(AVG(-t.amount_minor))                AS avg_amount,
      MIN(t.booked_at)                           AS first_seen,
      MAX(t.booked_at)                           AS last_seen,
      COUNT(DISTINCT TO_CHAR(t.booked_at, 'YYYY-MM')) AS distinct_months
    ${FROM}
    LEFT JOIN counterparties cp ON cp.id = t.counterparty_id
    WHERE ${where} AND t.amount_minor < 0
    GROUP BY 1
    HAVING COUNT(*) >= 3
       AND COUNT(DISTINCT TO_CHAR(t.booked_at, 'YYYY-MM')) >= 3
       AND STDDEV_POP(-t.amount_minor) < GREATEST(AVG(-t.amount_minor) * 0.15, 5000)
    ORDER BY avg_amount DESC
    LIMIT 10
  `
  );
}

export interface ListQueryOptions {
  sortField: 'date' | 'amount';
  sortOrder: 'asc' | 'desc';
  limit: number;
  offset: number;
}

/** One page of the transaction list, ordered and paginated in SQL. */
export function transactionPageQuery(
  filters: FilterState,
  search: string,
  options: ListQueryOptions
): PreparedQuery {
  const where = buildWhereClause(filters, search);
  const listWhere = filters.hideChildFees
    ? `${where.sql} AND t.parent_transaction_id IS NULL`
    : where.sql;
  const direction = options.sortOrder === 'desc' ? 'DESC' : 'ASC';
  const orderBy =
    options.sortField === 'amount'
      ? `ABS(t.amount_minor) ${direction}, t.booked_at DESC`
      : `t.booked_at ${direction}, t.seq ${direction}`;

  const params = [...where.params, options.limit, options.offset];

  return {
    sql: `
      SELECT
        t.*,
        cp.canonical_name AS counterparty_name,
        c.name            AS category_name,
        a.bank            AS account_bank,
        a.number_masked   AS account_number_masked,
        a.name            AS account_name
      ${FROM}
      LEFT JOIN counterparties cp ON cp.id = t.counterparty_id
      LEFT JOIN categories c      ON c.id = t.category_id
      WHERE ${listWhere}
      ORDER BY ${orderBy}
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `,
    params,
  };
}

export function transactionCountQuery(filters: FilterState, search: string): PreparedQuery {
  return prepare(
    filters,
    search,
    (where) =>
      `SELECT COUNT(*) AS count ${FROM} WHERE ${where}` +
      (filters.hideChildFees ? ' AND t.parent_transaction_id IS NULL' : '')
  );
}

/** Fee rows attached to a parent, for the transaction detail view. */
export function childFeesQuery(transactionId: string): PreparedQuery {
  return {
    sql: `
      SELECT id, description, amount_minor, kind
      FROM transactions
      WHERE parent_transaction_id = $1
      ORDER BY seq ASC
    `,
    params: [transactionId],
  };
}
