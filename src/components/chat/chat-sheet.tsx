import { useState, useRef, useEffect, useCallback } from 'react';
import { BottomSheet } from '~/components/ui';
import { useTransactionStore } from '~/stores/transactions';
import { useSettingsStore } from '~/stores/settings';
import { useLLMStore } from '~/stores/llm';
import { loadTransactions, executeQuery } from '~/lib/db/sqlite';
import type { ChatMessage } from '~/types';

interface ChatSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
}

export function ChatSheet({ isOpen, onClose, onOpenSettings }: ChatSheetProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [dbReady, setDbReady] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const transactions = useTransactionStore((s) => s.transactions);
  const chatEnabled = useSettingsStore((s) => s.chatEnabled);
  
  const generateSQL = useLLMStore((s) => s.generateSQL);
  const generateAnswer = useLLMStore((s) => s.generateAnswer);

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

  const processQuestion = useCallback(async (question: string): Promise<string> => {
    const sql = await generateSQL(question);
    const { columns, rows } = await executeQuery(sql);
    const resultsText = formatResults(columns, rows);
    const answer = await generateAnswer(question, resultsText);
    return answer;
  }, [generateSQL, generateAnswer]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isProcessing) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    const question = input.trim();
    setInput('');
    setIsProcessing(true);

    try {
      if (!dbReady) {
        throw new Error('Still loading your transactions...');
      }
      
      if (!chatEnabled) {
        throw new Error('Enable chat in settings first.');
      }

      const response = await processQuestion(question);

      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: response,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: error instanceof Error 
          ? `err: ${error.message}`
          : "err: couldn't process that. try asking differently.",
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleOpenSettings = () => {
    onClose();
    setTimeout(onOpenSettings, 200);
  };

  const suggestedQuestions = [
    'total spending?',
    'who did I send money to most?',
    'biggest expense?',
    'spending by month?',
  ];

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose}>
      <div className="flex h-[70vh] flex-col overflow-hidden">
        {/* Header */}
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

        {/* Messages */}
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
          {isProcessing && (
            <div className="flex justify-start">
              <div className="tui-box px-3 py-2">
                <span className="text-xs text-muted-foreground tui-pulse">
                  thinking...
                </span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} className="border-t border-border p-4">
          <div className="flex gap-2">
            <div className="flex-1 flex items-center tui-box">
              <span className="text-muted-foreground text-xs pl-3">&gt;</span>
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="ask anything..."
                disabled={isProcessing}
                className="flex-1 bg-transparent px-2 py-2 text-xs placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
              />
            </div>
            <button
              type="submit"
              disabled={!input.trim() || isProcessing}
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

function MessageBubble({ message }: { message: ChatMessage }) {
  const [copied, setCopied] = useState(false);
  const isError = message.content.startsWith('err:');

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const displayContent = isError 
    ? message.content.replace(/^err:\s*/, '') 
    : message.content;

  return (
    <div
      className={`flex ${
        message.role === 'user' ? 'justify-end' : 'justify-start'
      }`}
    >
      <div
        className={`max-w-[85%] text-xs px-3 py-2 ${
          message.role === 'user'
            ? 'tui-box-accent'
            : isError
              ? 'tui-box border-destructive/50 bg-destructive/10'
              : 'tui-box'
        }`}
      >
        <div className="flex-1">
          {message.role === 'assistant' && (
            <span className={isError ? 'text-destructive mr-1' : 'text-muted-foreground mr-1'}>
              {isError ? '!' : '>'}
            </span>
          )}
          <span className={`whitespace-pre-wrap ${isError ? 'text-destructive' : ''}`}>
            {displayContent}
          </span>
        </div>
        {!isError && (
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
