import ReactMarkdown from 'react-markdown';
import { useState, useRef, useEffect } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from 'ai';
import { BottomSheet } from '~/components/ui';
import { useTransactionStore } from '~/stores/transactions';
import { useSettingsStore } from '~/stores/settings';
import { loadTransactions, executeQuery } from '~/lib/db/sqlite';

const PROXY_URL = 'https://wakaru-api.ienioladewumi.workers.dev';
const chatTransport = new DefaultChatTransport({ api: `${PROXY_URL}/api/chat` });

interface ChatSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
}

export function ChatSheet({ isOpen, onClose, onOpenSettings }: ChatSheetProps) {
  const [dbReady, setDbReady] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const transactions = useTransactionStore((s) => s.transactions);
  const chatEnabled = useSettingsStore((s) => s.chatEnabled);

  const formatValue = (col: string, value: unknown): string => {
    if (value === null || value === undefined) return 'none';
    
    const colLower = col.toLowerCase();
    const isMonetary = colLower.includes('amount') || colLower.includes('total') || colLower.includes('sum');
    
    if (isMonetary && typeof value === 'number') {
      return `₦${value.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
    }
    
    if (colLower.includes('date') && typeof value === 'string') {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      }
    }
    
    return String(value);
  };

  const formatResults = (columns: string[], rows: unknown[][]): string => {
    if (rows.length === 0) return 'No results found';
    
    const lines = rows.slice(0, 20).map((row) => {
      return columns.map((col, i) => `${col}: ${formatValue(col, row[i])}`).join(', ');
    });
    
    if (rows.length > 20) {
      lines.push(`... and ${rows.length - 20} more rows`);
    }
    
    return lines.join('\n');
  };

  const [input, setInput] = useState('');

  const {
    messages,
    sendMessage,
    status,
    error,
    addToolOutput,
  } = useChat({
    transport: chatTransport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onToolCall({ toolCall }) {
      if (toolCall.toolName === 'queryDatabase') {
        const input = toolCall.input as { sql: string };
        executeQuery(input.sql)
          .then(({ columns, rows }) => {
            addToolOutput({
              tool: toolCall.toolName,
              toolCallId: toolCall.toolCallId,
              output: formatResults(columns, rows),
            });
          })
          .catch((err) => {
            addToolOutput({
              tool: toolCall.toolName,
              toolCallId: toolCall.toolCallId,
              output: `Error executing query: ${err instanceof Error ? err.message : 'Unknown error'}`,
            });
          });
      }
    },
  });

  const isLoading = status === 'streaming' || status === 'submitted';

  useEffect(() => {
    if (transactions.length > 0) {
      loadTransactions(transactions)
        .then(() => setDbReady(true))
        .catch((err) => console.error('Failed to load transactions into DB:', err));
    }
  }, [transactions]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  const handleOpenSettings = () => {
    onClose();
    setTimeout(onOpenSettings, 200);
  };

  const onFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || !dbReady || !chatEnabled) return;
    sendMessage({ text: input });
    setInput('');
  };

  const getErrorMessage = (): string | null => {
    if (!error) return null;
    
    const errorStr = error.message || String(error);
    
    if (errorStr.includes('rate_limit') || errorStr.includes('429')) {
      return "I'm getting a lot of requests right now! Please try again in a minute or two.";
    }
    
    if (errorStr.includes('service_unavailable') || errorStr.includes('503')) {
      return "I'm having trouble connecting right now. Please try again in a moment.";
    }
    
    return "Something went wrong. Please try again.";
  };

  const suggestedQuestions = [
    'total spending?',
    'who did I send money to most?',
    'biggest expense?',
    'spending by month?',
  ];

  const errorMessage = getErrorMessage();

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose}>
      <div className="flex h-[70vh] flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-4 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-accent">$</span>
            <h2 className="text-sm font-semibold">ask</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className={`tui-badge text-xs ${chatEnabled ? 'tui-badge-success' : ''}`}>
              {chatEnabled ? 'on' : 'off'}
            </span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 ? (
            <div className="space-y-4">
              {!chatEnabled && (
                <div className="tui-box p-3 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    &gt; chat is disabled
                  </p>
                  <p className="text-xs text-muted-foreground/70">
                    go to{' '}
                    <button
                      onClick={handleOpenSettings}
                      className="text-accent hover:underline"
                    >
                      [settings]
                    </button>
                    {' '}to enable it
                  </p>
                </div>
              )}

              {chatEnabled && (
                <div className="flex flex-wrap gap-1.5 justify-center">
                  {suggestedQuestions.map((q) => (
                    <button
                      key={q}
                      onClick={() => setInput(q)}
                      className="tui-btn-ghost text-xs px-2 py-1"
                    >
                      [{q}]
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))
          )}
          
          {isLoading && (
            <div className="flex justify-start">
              <div className="tui-box px-3 py-2">
                <span className="text-xs text-muted-foreground tui-pulse">
                  thinking...
                </span>
              </div>
            </div>
          )}
          
          {errorMessage && (
            <div className="flex justify-start">
              <div className="tui-box border-destructive/50 bg-destructive/10 px-3 py-2">
                <span className="text-destructive mr-1">!</span>
                <span className="text-xs text-destructive">{errorMessage}</span>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={onFormSubmit} className="border-t border-border p-4">
          <div className="flex gap-2">
            <div className="flex-1 flex items-center tui-box">
              <span className="text-muted-foreground text-xs pl-3">&gt;</span>
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="ask anything..."
                disabled={isLoading || !chatEnabled}
                className="flex-1 bg-transparent px-2 py-2 text-xs placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
              />
            </div>
            <button
              type="submit"
              disabled={!input.trim() || isLoading || !chatEnabled}
              className="tui-btn-primary px-3 py-2 text-xs disabled:opacity-30"
            >
              go
            </button>
          </div>
        </form>
      </div>
    </BottomSheet>
  );
}

interface MessageBubbleProps {
  message: {
    id: string;
    role: string;
    parts: Array<{ type: string; text?: string }>;
  };
}

function MessageBubble({ message }: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);

  const content = message.parts
    ?.filter((p) => p.type === 'text')
    .map((p) => p.text)
    .join('') || '';

  if (!content) return null;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] text-xs px-3 py-2 ${
          message.role === 'user' ? 'tui-box-accent' : 'tui-box'
        }`}
      >
        <div className="flex-1">
          {message.role === 'assistant' && (
            <span className="text-muted-foreground mr-1">&gt;</span>
          )}
          <div className="tui-markdown"><ReactMarkdown>{content}</ReactMarkdown></div>
        </div>
        {message.role === 'assistant' && content && (
          <div className="mt-2 pt-2 border-t border-border/50 flex justify-end">
            <button
              onClick={handleCopy}
              className="text-muted-foreground hover:text-foreground transition-colors text-xs"
            >
              {copied ? 'copied!' : 'copy'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
