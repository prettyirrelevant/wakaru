import { CURRENCY_SYMBOL, type CurrencyCode } from '~/types';
import { cn } from '~/lib/utils';

const OPTIONS: CurrencyCode[] = ['NGN', 'USD', 'GBP', 'EUR'];

interface CurrencyPickerProps {
  value: CurrencyCode;
  onChange: (currency: CurrencyCode) => void;
}

/**
 * Currency is per account and cannot be inferred from the statement text, so
 * it has to be asked. Domiciliary accounts were previously summed as naira.
 */
export function CurrencyPicker({ value, onChange }: CurrencyPickerProps) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-[10px] text-muted-foreground">&gt; currency</legend>
      <div className="flex flex-wrap gap-1">
        {OPTIONS.map((currency) => (
          <button
            key={currency}
            type="button"
            onClick={() => onChange(currency)}
            aria-pressed={value === currency}
            className={cn(
              'border px-2 py-1 text-xs transition-colors',
              value === currency
                ? 'border-accent bg-accent text-accent-foreground'
                : 'border-border bg-muted hover:border-border-strong'
            )}
          >
            {CURRENCY_SYMBOL[currency]} {currency}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
