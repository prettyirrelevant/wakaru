import type { ChatMode } from '~/types';

interface ChatBadgeProps {
  mode: ChatMode;
}

export function ChatBadge({ mode }: ChatBadgeProps) {
  if (mode.type === 'off') {
    return <span className="tui-badge text-xs">off</span>;
  }

  if (mode.type === 'cloud') {
    return <span className="tui-badge tui-badge-success text-xs">cloud ●</span>;
  }

  if (mode.type === 'local') {
    if (mode.status === 'connected') {
      return <span className="tui-badge tui-badge-success text-xs">local ●</span>;
    }
    if (mode.status === 'testing') {
      return <span className="tui-badge tui-badge-warning text-xs">local ◐</span>;
    }
    return <span className="tui-badge text-xs">local ○</span>;
  }

  return null;
}
