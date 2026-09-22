import type { ChatMode } from '~/types';

interface ChatBadgeProps {
  mode: ChatMode;
}

export function ChatBadge({ mode }: ChatBadgeProps) {
  if (mode.type === 'off') {
    return <span className="tui-badge text-xs">Off</span>;
  }

  if (mode.type === 'cloud') {
    return <span className="tui-badge tui-badge-success text-xs">Cloud</span>;
  }

  if (mode.type === 'local') {
    if (mode.status === 'connected') {
      return <span className="tui-badge tui-badge-success text-xs">Local</span>;
    }
    if (mode.status === 'testing') {
      return <span className="tui-badge tui-badge-warning text-xs">Connecting</span>;
    }
    return <span className="tui-badge text-xs">Local Offline</span>;
  }

  return null;
}
