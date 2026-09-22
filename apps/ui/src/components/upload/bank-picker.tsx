import { cn } from '~/lib/utils';
import { SUPPORTED_BANKS } from '~/lib/constants';
import type { BankType } from '~/types';

interface BankPickerProps {
  onSelectBank: (bank: BankType) => void;
}

export function BankPicker({ onSelectBank }: BankPickerProps) {
  const availableBanks = SUPPORTED_BANKS.filter((b) => b.available);
  const comingSoonBanks = SUPPORTED_BANKS.filter((b) => !b.available);

  return (
    <fieldset>
      <legend className="mb-3 text-sm font-semibold"><span className="text-accent">&gt;</span> select bank</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {availableBanks.map((bank) => (
          <button
            key={bank.id}
            type="button"
            onClick={() => onSelectBank(bank.id)}
            className={cn(
              'group flex min-h-14 touch-manipulation items-center justify-between gap-2 border px-3 py-2.5 text-left',
              'transition-[background-color,border-color,color,transform] duration-150 ease-out active:scale-[0.98]',
              'border-border bg-surface text-foreground hover:border-accent/60 hover:bg-accent/[0.04]'
            )}
          >
            <span className="min-w-0 truncate text-xs font-semibold sm:text-sm">[{bank.name.toLowerCase()}]</span>
            <span className="shrink-0 font-mono text-[10px] uppercase text-muted-foreground">
              {bank.fileFormat}
            </span>
          </button>
        ))}
      </div>

      {comingSoonBanks.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          # +{comingSoonBanks.length} more banks coming
        </p>
      )}
    </fieldset>
  );
}
