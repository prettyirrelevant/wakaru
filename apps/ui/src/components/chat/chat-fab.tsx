interface ChatFabProps {
  onClick: () => void;
}

export function ChatFab({ onClick }: ChatFabProps) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-6 right-6 px-3 py-2 text-xs bg-background border border-border hover:border-accent hover:text-accent transition-colors"
      aria-label="Open chat"
    >
      [ask]
    </button>
  );
}
