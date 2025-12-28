interface ChatFabProps {
  onClick: () => void;
}

export function ChatFab({ onClick }: ChatFabProps) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-6 right-6 flex h-12 w-12 items-center justify-center bg-accent text-accent-foreground border border-accent shadow-lg transition-all hover:bg-accent/90 active:scale-95"
      aria-label="Open chat"
    >
      <span className="text-sm font-medium">?</span>
    </button>
  );
}
