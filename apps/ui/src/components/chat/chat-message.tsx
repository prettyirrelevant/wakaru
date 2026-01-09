import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

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

  const timeLabel = createdAt ? dayjs(createdAt).fromNow() : '';

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className={`group flex flex-col ${message.role === 'user' ? 'items-end' : 'items-start'}`}>
      <div
        className={`max-w-[85%] text-xs px-3 py-2 ${
          message.role === 'user' ? 'tui-box-accent' : 'tui-box'
        }`}
      >
        {message.role === 'assistant' && (
          <span className="text-muted-foreground mr-1">&gt;</span>
        )}
        <span className="tui-markdown">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ p: 'span' }}>{content}</ReactMarkdown>
        </span>
        {isStreaming && <span className="cursor-blink ml-0.5"></span>}
      </div>
      {content && (
        <div className="flex items-center gap-2 mt-1 opacity-40 group-hover:opacity-100 transition-opacity">
          {timeLabel && <span className="text-muted-foreground text-[10px]">{timeLabel}</span>}
          <button
            onClick={handleCopy}
            className="text-muted-foreground hover:text-foreground transition-colors text-[10px]"
          >
            {copied ? '[copied]' : '[copy]'}
          </button>
        </div>
      )}
    </div>
  );
}
