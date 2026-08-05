import {
  type BankType,
  type CurrencyCode,
  type ImportSummary,
  type ParseOutput,
  type ParsedTransaction,
  type ReconcileResult,
  TransactionType,
} from '~/types';
import {
  type LedgerInsert,
  type Queryable,
  createImport,
  findImportByHash,
  findOrCreateAccount,
  insertTransactions,
  listRules,
  markSelfCounterparties,
  findOrCreateCounterparty,
  setImportReconciliation,
} from '~/lib/db';
import { hashParts } from '~/lib/utils/hash';
import { applyRules, sortRules } from './rules';
import { reconcileBalances, type ReconcilableRow } from './reconcile';
import { linkFees } from './fees';
import { linkInternalTransfers } from './transfers';

export interface IngestInput {
  parsed: ParseOutput;
  fileName: string;
  fileHash: string;
  bank: BankType;
  currency: CurrencyCode;
  parserVersion: string;
  accountNumber?: string;
  accountName?: string;
}

/**
 * Turn one parsed statement into ledger rows.
 *
 * The parser knows about a file; everything that makes a row part of a ledger
 * — which account it belongs to, where it sits in the statement, who the
 * counterparty is as a lasting identity, what it cost in fees — is decided
 * here.
 */
export async function ingestParsedStatement(
  db: Queryable,
  input: IngestInput
): Promise<ImportSummary> {
  const { parsed } = input;

  const declaredAccountNumber =
    input.accountNumber ?? parsed.transactions.find((t) => t.meta?.ownAccountNumber)?.meta?.ownAccountNumber;

  const account = await findOrCreateAccount(db, {
    bank: input.bank,
    numberMasked: maskAccountNumber(declaredAccountNumber),
    name: input.accountName,
    currency: input.currency,
  });

  const alreadyImported = await findImportByHash(db, account.id, input.fileHash);
  if (alreadyImported) {
    return {
      importId: alreadyImported.id,
      accountId: account.id,
      rowsSeen: alreadyImported.rowsSeen,
      rowsParsed: alreadyImported.rowsParsed,
      inserted: 0,
      duplicates: parsed.transactions.length,
      reconcile: {
        ok: alreadyImported.reconciled,
        checked: 0,
        breaks: [],
      },
      periodStart: alreadyImported.periodStart,
      periodEnd: alreadyImported.periodEnd,
    };
  }

  const ordered = toStatementOrder(parsed.transactions);
  const importId = `imp-${hashParts(account.id, input.fileHash)}`;

  const rules = sortRules(await listRules(db));
  const counterpartyCache = new Map<string, string | null>();
  const rows: LedgerInsert[] = [];
  const occurrences = new Map<string, number>();

  for (let index = 0; index < ordered.length; index++) {
    const tx = ordered[index];
    const meta = tx.meta ?? {};

    const counterpartyId = await resolveCounterparty(db, counterpartyCache, tx);
    const kind = meta.type ?? TransactionType.Other;

    // Two identical transactions on the same day are two transactions. The
    // occurrence index keeps their ids distinct while staying stable across a
    // re-import of the same period, so overlapping statements still collapse.
    const identity = hashParts(
      account.id,
      tx.date.slice(0, 10),
      tx.amount,
      tx.reference,
      tx.description
    );
    const occurrence = occurrences.get(identity) ?? 0;
    occurrences.set(identity, occurrence + 1);

    const category = applyRules(rules, {
      description: tx.description,
      counterpartyName: meta.counterpartyName ?? null,
      kind,
    });

    rows.push({
      id: `tx-${hashParts(identity, occurrence)}`,
      accountId: account.id,
      importId,
      bookedAt: tx.date,
      valueAt: meta.valueDate ?? null,
      seq: index,
      amountMinor: tx.amount,
      currency: input.currency,
      balanceAfterMinor: meta.balanceAfter ?? null,
      description: tx.description,
      narration: meta.narration ?? null,
      reference: tx.reference,
      counterpartyId,
      kind,
      categoryId: category?.categoryId ?? null,
      categorySource: category?.source ?? null,
      searchText: buildSearchText(tx),
    });
  }

  const periodStart = rows.length ? minIso(rows.map((r) => r.bookedAt)) : null;
  const periodEnd = rows.length ? maxIso(rows.map((r) => r.bookedAt)) : null;

  await createImport(db, {
    id: importId,
    accountId: account.id,
    fileName: input.fileName,
    fileHash: input.fileHash,
    parserId: input.bank,
    parserVersion: input.parserVersion,
    periodStart,
    periodEnd,
    rowsSeen: parsed.rowsSeen,
    rowsParsed: rows.length,
  });

  const inserted = await insertTransactions(db, rows);

  const reconcile = reconcileBalances(rows as ReconcilableRow[]);
  await setImportReconciliation(db, importId, reconcile.ok, reconcile.breaks.length);

  await applyFeeLinks(db, rows);

  await markSelfCounterparties(db);
  await linkInternalTransfers(db, { start: periodStart, end: periodEnd });

  return {
    importId,
    accountId: account.id,
    rowsSeen: parsed.rowsSeen,
    rowsParsed: rows.length,
    inserted,
    duplicates: rows.length - inserted,
    reconcile,
    periodStart,
    periodEnd,
  };
}

/**
 * Statements are usually written oldest-first, but not always, and the
 * running balance only reconciles when rows are walked in the order the bank
 * wrote them. Try both directions and keep whichever the balance column
 * agrees with.
 */
export function toStatementOrder(transactions: ParsedTransaction[]): ParsedTransaction[] {
  if (transactions.length < 3) return transactions;

  const asGiven = scoreOrder(transactions);
  if (asGiven.ok === true) return transactions;

  const reversed = transactions.slice().reverse();
  const asReversed = scoreOrder(reversed);

  if (asReversed.ok === true) return reversed;
  if (asReversed.breaks.length < asGiven.breaks.length) return reversed;

  return transactions;
}

function scoreOrder(transactions: ParsedTransaction[]): ReconcileResult {
  return reconcileBalances(
    transactions.map((tx, i) => ({
      id: String(i),
      bookedAt: tx.date,
      amountMinor: tx.amount,
      balanceAfterMinor: tx.meta?.balanceAfter ?? null,
    }))
  );
}

async function resolveCounterparty(
  db: Queryable,
  cache: Map<string, string | null>,
  tx: ParsedTransaction
): Promise<string | null> {
  const name = tx.meta?.counterpartyName?.trim();
  if (!name) return null;

  const cacheKey = `${name}|${tx.meta?.counterpartyAccount ?? ''}|${tx.meta?.counterpartyBank ?? ''}`;
  const cached = cache.get(cacheKey);
  if (cached !== undefined) return cached;

  const id = await findOrCreateCounterparty(db, {
    name,
    accountNumber: tx.meta?.counterpartyAccount,
    bank: tx.meta?.counterpartyBank,
  });

  cache.set(cacheKey, id);
  return id;
}

async function applyFeeLinks(db: Queryable, rows: LedgerInsert[]): Promise<void> {
  const links = linkFees(rows);
  for (const [feeId, parentId] of links) {
    await db.query('UPDATE transactions SET parent_transaction_id = $2 WHERE id = $1', [
      feeId,
      parentId,
    ]);
  }
}

function buildSearchText(tx: ParsedTransaction): string {
  return [tx.description, tx.meta?.narration, tx.meta?.counterpartyName, tx.reference]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/** Keep only the last four digits; the full number never needs storing. */
export function maskAccountNumber(accountNumber?: string): string {
  if (!accountNumber) return '';
  const digits = accountNumber.replace(/\D/g, '');
  if (digits.length < 4) return '';
  return `****${digits.slice(-4)}`;
}

function minIso(values: string[]): string {
  return values.reduce((min, v) => (v < min ? v : min), values[0]);
}

function maxIso(values: string[]): string {
  return values.reduce((max, v) => (v > max ? v : max), values[0]);
}
