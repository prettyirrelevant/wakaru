import type { ChatModeType, LocalServerStatus } from '~/types';

interface ModeToggleProps {
  value: ChatModeType;
  onChange: (value: ChatModeType) => void;
  localStatus?: LocalServerStatus;
}

const OPTIONS: { value: ChatModeType; label: string }[] = [
  { value: 'off', label: 'off' },
  { value: 'cloud', label: 'cloud' },
  { value: 'local', label: 'local' },
];

export function ModeToggle({ value, onChange, localStatus }: ModeToggleProps) {
  const getLocalIndicator = () => {
    if (value !== 'local') return null;
    if (localStatus === 'connected') return <span className="text-success ml-1">●</span>;
    if (localStatus === 'testing') return <span className="text-warning ml-1 animate-pulse">●</span>;
    if (localStatus === 'error') return <span className="text-destructive ml-1">●</span>;
    return <span className="text-muted-foreground ml-1">○</span>;
  };

  return (
    <div className="inline-flex border border-border bg-muted/50 p-1" role="group" aria-label="AI mode">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={`touch-manipulation px-3 py-1.5 text-xs font-semibold transition-colors ${
            value === option.value
              ? 'bg-surface text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          [{option.label}]
          {option.value === 'local' && getLocalIndicator()}
        </button>
      ))}
    </div>
  );
}
