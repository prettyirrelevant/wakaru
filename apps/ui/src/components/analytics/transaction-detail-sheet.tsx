import { useLiveQuery } from '@electric-sql/pglite-react';
import type { CurrencyCode, LedgerTransaction } from '~/types';
import { BottomSheet } from '~/components/ui/bottom-sheet';
import { CategoryPicker } from './category-picker';
import { childFeesQuery } from '~/lib/queries/analytics';
import { formatCurrency, formatDate, formatKind } from '~/lib/utils';
import { cn } from '~/lib/utils';

interface TransactionDetailSheetProps {
  transaction: LedgerTransaction | null;
  currency: CurrencyCode;
  onClose: () => void;
}

export function TransactionDetailSheet({
  transaction,
  currency,
  onClose,
}: TransactionDetailSheetProps) {
  return (
    <BottomSheet isOpen={transaction !== null} onClose={onClose} title="Transaction details">
      {transaction && <TransactionDetail transaction={transaction} currency={currency} />}
    </BottomSheet>
  );
}

function TransactionDetail({
  transaction,
  currency,
}: {
  transaction: LedgerTransaction;
  currency: CurrencyCode;
}) {
  const isInflow = transaction.amountMinor > 0;
  const transactionCurrency = transaction.currency ?? currency;
  const feesQuery = childFeesQuery(transaction.id);
  const feesResult = useLiveQuery<{
    id: string;
    description: string;
    amount_minor: string;
    kind: string;
  }>(feesQuery.sql, feesQuery.params);
  const fees = feesResult?.rows ?? [];
  const feeTotal = fees.reduce((sum, fee) => sum + Math.abs(Number(fee.amount_minor)), 0);

  return (
    <div className="overflow-y-auto px-5 pb-8 sm:px-8">
      <div className="border-b border-border pb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {isInflow ? 'Money Received' : 'Money Sent'}
        </p>
        <p
          className={cn(
            'mono-nums mt-2 text-3xl font-semibold tracking-[-0.04em]',
            isInflow ? 'text-success' : 'text-foreground'
          )}
        >
          {isInflow ? '+' : '-'}
          {formatCurrency(Math.abs(transaction.amountMinor), transactionCurrency)}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="tui-badge">[{formatKind(transaction.kind)}]</span>
          {feeTotal > 0 && (
            <span className="tui-badge tui-badge-warning">
              {formatCurrency(feeTotal, transactionCurrency)} in fees
            </span>
          )}
        </div>
      </div>

      {transaction.transferGroupId && (
        <p className="mt-5 border border-accent/25 bg-accent/[0.07] p-3 text-xs leading-5 text-accent">
          Wakaru matched this transaction to another account. Spending totals exclude it.
        </p>
      )}

      <DetailSection title="Details">
        <DetailRow label="Date" value={formatDate(transaction.bookedAt)} />
        {transaction.valueAt && transaction.valueAt !== transaction.bookedAt && (
          <DetailRow label="Value Date" value={formatDate(transaction.valueAt)} />
        )}
        <DetailRow label="Account" value={transaction.accountLabel ?? 'Unavailable'} />
        {transaction.balanceAfterMinor !== null && (
          <DetailRow
            label="Balance After"
            value={formatCurrency(transaction.balanceAfterMinor, transactionCurrency)}
            mono
          />
        )}
      </DetailSection>

      <DetailSection title="Description">
        <p className="break-words text-sm leading-6">{transaction.description}</p>
        {transaction.narration && transaction.narration !== transaction.description && (
          <p className="mt-2 break-words text-xs leading-5 text-muted-foreground">
            {transaction.narration}
          </p>
        )}
      </DetailSection>

      {transaction.counterpartyName && (
        <DetailSection title={isInflow ? 'Received From' : 'Paid To'}>
          <p className="break-words text-sm font-medium">{transaction.counterpartyName}</p>
        </DetailSection>
      )}

      <DetailSection title="Category">
        <CategoryPicker transactionId={transaction.id} />
      </DetailSection>

      {fees.length > 0 && (
        <DetailSection title="Fees">
          {fees.map((fee) => (
            <DetailRow
              key={fee.id}
              label={fee.description}
              value={formatCurrency(Math.abs(Number(fee.amount_minor)), transactionCurrency)}
              mono
            />
          ))}
        </DetailSection>
      )}

      <DetailSection title="Reference">
        <p className="break-all font-mono text-xs text-muted-foreground">{transaction.reference}</p>
      </DetailSection>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5 border border-border bg-surface p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-xs">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className={cn('break-words text-right', mono && 'mono-nums')}>{value}</span>
    </div>
  );
}
