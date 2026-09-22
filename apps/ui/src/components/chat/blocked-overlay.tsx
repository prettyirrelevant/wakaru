import type { ChatMode } from '~/types';
import { Button } from '~/components/ui/button';

interface BlockedOverlayProps {
  chatMode: ChatMode;
  onOpenSettings: () => void;
  onUseCloud: () => void;
}

export function BlockedOverlay({ chatMode, onOpenSettings, onUseCloud }: BlockedOverlayProps) {
  const statusText = chatMode.type === 'local' && chatMode.status === 'error'
    ? 'The local server is unreachable.'
    : 'The local server needs configuration.';

  const errorText = chatMode.type === 'local' ? chatMode.error : null;

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/85 p-5 backdrop-blur-sm">
      <div className="tui-box max-w-sm space-y-4 p-6 text-center">
        <p className="text-sm font-semibold">{statusText}</p>

        {errorText && (
          <p className="text-xs text-muted-foreground">{errorText}</p>
        )}

        <div className="flex flex-col justify-center gap-2 sm:flex-row">
          <Button
            onClick={onOpenSettings}
          >
            Open Settings
          </Button>
          <Button
            variant="secondary"
            onClick={onUseCloud}
          >
            Use Cloud
          </Button>
        </div>
      </div>
    </div>
  );
}
