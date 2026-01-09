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
    <div className="flex gap-1">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={`text-xs px-3 py-1.5 border transition-colors ${
            value === option.value
              ? 'bg-accent text-accent-foreground border-accent'
              : 'bg-muted border-border hover:border-border-strong'
          }`}
        >
          [{option.label}]
          {option.value === 'local' && getLocalIndicator()}
        </button>
      ))}
    </div>
  );
}
