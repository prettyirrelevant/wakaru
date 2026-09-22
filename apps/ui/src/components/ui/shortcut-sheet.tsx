import { BottomSheet } from './bottom-sheet';

interface ShortcutSheetProps {
  isOpen: boolean;
  onClose: () => void;
  instant?: boolean;
}

const SHORTCUTS = [
  { keys: ['mod', 'shift', 'u'], label: 'add a statement' },
  { keys: ['mod', 'shift', 'a'], label: 'ask about your money' },
  { keys: ['mod', 'shift', 'f'], label: 'search transactions' },
  { keys: ['mod', ','], label: 'open settings' },
  { keys: ['mod', '/'], label: 'show keyboard shortcuts' },
  { keys: ['esc'], label: 'close the current panel' },
];

export function ShortcutSheet({ isOpen, onClose, instant }: ShortcutSheetProps) {
  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Keyboard shortcuts" instant={instant}>
      <div className="overflow-y-auto px-5 pb-8 sm:px-8">
        <p className="text-xs text-accent">$ shortcuts</p>
        <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">keyboard shortcuts</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          shortcuts work outside form fields. mod means Command on macOS and Control elsewhere.
        </p>

        <dl className="mt-6 divide-y divide-border border border-border bg-surface px-4">
          {SHORTCUTS.map((shortcut) => (
            <div key={shortcut.label} className="flex items-center justify-between gap-4 py-3.5">
              <dt className="text-sm">{shortcut.label}</dt>
              <dd className="flex shrink-0 items-center gap-1">
                {shortcut.keys.map((key) => (
                  <kbd
                    key={key}
                    className="min-w-7 border border-border-strong bg-muted px-1.5 py-1 text-center font-mono text-[11px] font-semibold text-muted-foreground"
                  >
                    {key}
                  </kbd>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </BottomSheet>
  );
}
