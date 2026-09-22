import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ChatMessageProps {
  message: {
    id: string;
    role: string;
    parts?: Array<{ type: string; text?: string }>;
  };
  createdAt?: Date;
  isStreaming?: boolean;
}

export function ChatMessage({ message, createdAt, isStreaming = false }: ChatMessageProps) {
  const [copied, setCopied] = useState(false);

  const content = message.parts
    ?.filter((p) => p.type === 'text')
    .map((p) => p.text)
    .join('') || '';

  if (!content) return null;

  const timeLabel = createdAt ? formatRelativeTime(createdAt) : '';

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className={`group flex flex-col ${message.role === 'user' ? 'items-end' : 'items-start'}`}>
      <div
        className={`max-w-[90%] px-3.5 py-2.5 text-sm sm:max-w-[85%] ${
          message.role === 'user' ? 'bg-accent text-accent-foreground' : 'border border-border bg-surface'
        }`}
      >
        <span className="tui-markdown">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ p: 'span' }}>{content}</ReactMarkdown>
        </span>
        {isStreaming && <span className="cursor-blink ml-0.5"></span>}
      </div>
      {content && (
        <div className="mt-1 flex items-center gap-2 opacity-60 transition-opacity group-hover:opacity-100">
          {timeLabel && <span className="text-muted-foreground text-[10px]">{timeLabel}</span>}
          <button
            onClick={handleCopy}
            aria-label="Copy message"
            className="text-[10px] text-muted-foreground transition-colors hover:text-foreground"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      )}
    </div>
  );
}

const relativeTime = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

function formatRelativeTime(date: Date): string {
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  if (Math.abs(seconds) < 60) return relativeTime.format(seconds, 'second');
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return relativeTime.format(minutes, 'minute');
  return relativeTime.format(Math.round(minutes / 60), 'hour');
}
