import { CURRENCY_SYMBOL, type CurrencyCode } from '~/types';

const OPTIONS: CurrencyCode[] = ['NGN', 'USD', 'GBP', 'EUR'];

interface CurrencyPickerProps {
  value: CurrencyCode;
  onChange: (currency: CurrencyCode) => void;
}

export function CurrencyPicker({ value, onChange }: CurrencyPickerProps) {
  return (
    <label className="flex items-center gap-3 text-xs text-muted-foreground">
      <span>currency</span>
      <select
        name="currency"
        value={value}
        onChange={(event) => onChange(event.target.value as CurrencyCode)}
        className="tui-input h-9 min-w-28 py-1 text-xs font-semibold text-foreground"
      >
        {OPTIONS.map((currency) => (
          <option key={currency} value={currency}>
            {CURRENCY_SYMBOL[currency]} {currency}
          </option>
        ))}
      </select>
    </label>
  );
}
