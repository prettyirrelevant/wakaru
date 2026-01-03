import { cn } from '~/lib/utils';
import { SUPPORTED_BANKS } from '~/lib/constants';
import type { BankType } from '~/types';

interface BankPickerProps {
  selectedBank: BankType | null;
  onSelectBank: (bank: BankType) => void;
}

export function BankPicker({ selectedBank, onSelectBank }: BankPickerProps) {
  const availableBanks = SUPPORTED_BANKS.filter((b) => b.available);
  const comingSoonBanks = SUPPORTED_BANKS.filter((b) => !b.available);

  return (
    <div className="space-y-4">
      {/* Available Banks */}
      <div className="flex flex-wrap gap-2">
        {availableBanks.map((bank) => (
          <button
            key={bank.id}
            onClick={() => onSelectBank(bank.id)}
            className={cn(
              'border px-3 py-1.5 text-xs transition-colors',
              selectedBank === bank.id
                ? 'bg-accent text-accent-foreground border-accent'
                : 'border-border hover:border-accent hover:text-accent'
            )}
          >
            [{bank.name.toLowerCase()}]
          </button>
        ))}
      </div>

      {/* Coming Soon Banks */}
      {comingSoonBanks.length > 0 && (
        <p className="text-xs text-muted-foreground/60">
          # +{comingSoonBanks.length} more banks coming
        </p>
      )}
    </div>
  );
}
