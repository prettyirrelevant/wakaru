import { useTinykeys } from './useTinykeys';

interface KeyboardShortcutOptions {
  disabled?: boolean;
  onAddStatement: () => void;
  onOpenChat: () => void;
  onOpenSettings: () => void;
  onShowHelp: () => void;
}

export function useKeyboardShortcuts({
  disabled = false,
  onAddStatement,
  onOpenChat,
  onOpenSettings,
  onShowHelp,
}: KeyboardShortcutOptions) {
  const run = (action: () => void) => (event: KeyboardEvent) => {
    if (event.repeat) return;
    event.preventDefault();
    action();
  };

  useTinykeys(
    {
      '$mod+Shift+KeyU': run(onAddStatement),
      '$mod+Shift+KeyA': run(onOpenChat),
      '$mod+,': run(onOpenSettings),
      '$mod+/': run(onShowHelp),
    },
    disabled
  );
}
