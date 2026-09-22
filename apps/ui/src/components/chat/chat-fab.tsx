interface ChatFabProps {
  onClick: () => void;
}

export function ChatFab({ onClick }: ChatFabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-4 z-20 flex h-11 touch-manipulation items-center gap-2 border border-border bg-background px-3.5 text-xs font-semibold text-foreground shadow-xl shadow-black/20 transition-[border-color,color,transform] duration-150 ease-out hover:border-accent hover:text-accent active:scale-[0.97] sm:right-8"
      aria-label="Ask about your money"
    >
      <Icon name="message" className="h-4 w-4" />
      <span>[ask]</span>
      <kbd className="hidden border-l border-border pl-2 font-mono text-[10px] text-muted-foreground sm:inline">⇧⌘A</kbd>
    </button>
  );
}
import { Icon } from '~/components/ui/icon';
