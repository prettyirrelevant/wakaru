import type { Queryable } from '~/lib/db';
import { hashParts } from '~/lib/utils/hash';
import { normalizeCounterpartyName } from '~/lib/db';

/** How far apart the two legs of one movement may be booked. */
const WINDOW_DAYS = 3;

interface CandidateRow {
  out_id: string;
  in_id: string;
  out_account: string;
  in_account: string;
  amount_minor: string;
  out_name: string | null;
  in_name: string | null;
  out_self: boolean | null;
  in_self: boolean | null;
  bank_match: boolean;
}

/**
 * Link the two legs of a transfer between the user's own accounts.
 *
 * Without this, moving ₦100k from GTB to Kuda and importing both statements
 * reports ₦100k of spending and ₦100k of income that never happened. Net is
 * accidentally right; every other number is wrong.
 *
 * Matching is deliberately conservative — a missed link understates nothing,
 * while a wrong link hides real spending. A pair must have equal and opposite
 * amounts in the same currency, sit within a few days of each other, and
 * carry corroborating counterparty evidence: either a counterparty already
 * known to be the user's own account, or a counterparty bank that names the
 * account on the other leg.
 *
 * @returns the number of transfer pairs linked
 */
export async function linkInternalTransfers(
  db: Queryable,
  /** Restrict to the period just imported; a full self-join grows with history. */
  period?: { start: string | null; end: string | null }
): Promise<number> {
  const params: string[] = [];
  let window = '';
  if (period?.start && period?.end) {
    params.push(period.start, period.end);
    window = `AND o.booked_at BETWEEN $1::timestamptz - INTERVAL '${WINDOW_DAYS} days'
                                  AND $2::timestamptz + INTERVAL '${WINDOW_DAYS} days'`;
  }

  const result = await db.query<CandidateRow>(
    `
    SELECT
      o.id                AS out_id,
      i.id                AS in_id,
      o.account_id        AS out_account,
      i.account_id        AS in_account,
      ABS(o.amount_minor) AS amount_minor,
      ocp.canonical_name  AS out_name,
      icp.canonical_name  AS in_name,
      ocp.is_self         AS out_self,
      icp.is_self         AS in_self,
      (
        LOWER(COALESCE(ocp.bank, '')) LIKE '%' || LOWER(ia.bank) || '%'
        OR LOWER(COALESCE(icp.bank, '')) LIKE '%' || LOWER(oa.bank) || '%'
      )                   AS bank_match
    FROM transactions o
    JOIN transactions i
      ON  i.account_id <> o.account_id
      AND i.currency    = o.currency
      AND i.amount_minor = -o.amount_minor
      AND i.booked_at BETWEEN o.booked_at - INTERVAL '${WINDOW_DAYS} days'
                          AND o.booked_at + INTERVAL '${WINDOW_DAYS} days'
    JOIN accounts oa ON oa.id = o.account_id
    JOIN accounts ia ON ia.id = i.account_id
    LEFT JOIN counterparties ocp ON ocp.id = o.counterparty_id
    LEFT JOIN counterparties icp ON icp.id = i.counterparty_id
    WHERE o.amount_minor < 0
      AND o.transfer_group_id IS NULL
      AND i.transfer_group_id IS NULL
      ${window}
    ORDER BY o.booked_at ASC, o.id ASC
    `,
    params
  );

  const usedOut = new Set<string>();
  const usedIn = new Set<string>();
  const pairs: { outId: string; inId: string }[] = [];

  for (const row of result.rows) {
    if (usedOut.has(row.out_id) || usedIn.has(row.in_id)) continue;
    if (!isConfident(row)) continue;

    usedOut.add(row.out_id);
    usedIn.add(row.in_id);
    pairs.push({ outId: row.out_id, inId: row.in_id });
  }

  for (const pair of pairs) {
    const groupId = `tg-${hashParts(pair.outId, pair.inId)}`;
    await db.query('UPDATE transactions SET transfer_group_id = $2 WHERE id = $1 OR id = $3', [
      pair.outId,
      groupId,
      pair.inId,
    ]);
  }

  return pairs.length;
}

function isConfident(row: CandidateRow): boolean {
  const selfEvidence = row.out_self === true || row.in_self === true;
  if (!selfEvidence && !row.bank_match) return false;

  // When both legs name a counterparty they should name the same person —
  // the user. Different names mean these are two unrelated payments that
  // happen to share an amount.
  if (row.out_name && row.in_name) {
    return normalizeCounterpartyName(row.out_name) === normalizeCounterpartyName(row.in_name);
  }

  return true;
}

