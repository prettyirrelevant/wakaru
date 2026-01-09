import type { ChatMode } from '~/types';

interface BlockedOverlayProps {
  chatMode: ChatMode;
  onOpenSettings: () => void;
  onUseCloud: () => void;
}

export function BlockedOverlay({ chatMode, onOpenSettings, onUseCloud }: BlockedOverlayProps) {
  const statusText = chatMode.type === 'local' && chatMode.status === 'error'
    ? 'local server unreachable'
    : 'local server not configured';

  const errorText = chatMode.type === 'local' ? chatMode.error : null;

  return (
    <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-10">
      <div className="tui-box p-6 text-center space-y-4 max-w-sm">
        <p className="text-sm">{statusText}</p>

        {errorText && (
          <p className="text-xs text-muted-foreground">{errorText}</p>
        )}

        <div className="flex flex-row gap-2 justify-center flex-nowrap">
          <button
            onClick={onOpenSettings}
            className="tui-btn-primary text-xs px-3 py-1.5 whitespace-nowrap"
          >
            [ open settings ]
          </button>
          <button
            onClick={onUseCloud}
            className="tui-btn-ghost text-xs px-3 py-1.5 whitespace-nowrap"
          >
            [ use cloud ]
          </button>
        </div>
      </div>
    </div>
  );
}
