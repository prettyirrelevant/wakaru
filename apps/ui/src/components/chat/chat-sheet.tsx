import { useState, useRef, useEffect, useMemo } from 'react';
import { useChat } from '@ai-sdk/react';
import { lastAssistantMessageIsCompleteWithToolCalls } from 'ai';
import type { UIMessage } from 'ai';
import { usePGlite } from '@electric-sql/pglite-react';
import { BottomSheet } from '~/components/ui/bottom-sheet';
import { useSettingsStore } from '~/stores/settings';
import { executeModelQuery } from '~/lib/db';
import type { ChatMode } from '~/types';
import { ChatBadge } from './chat-badge';
import { ChatMessage } from './chat-message';
import { SuggestedQuestions } from './suggested-questions';
import { BlockedOverlay } from './blocked-overlay';
import { formatResults, formatQueryError, getErrorMessage, getChatKey } from '~/lib/chat/utils';
import { createChatTransport } from '~/lib/chat/transport';

interface ChatSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
  instant?: boolean;
}

export function ChatSheet({ isOpen, onClose, onOpenSettings, instant }: ChatSheetProps) {
  const chatMode = useSettingsStore((s) => s.chatMode);
  const chatKey = getChatKey(chatMode);

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Ask about your money" instant={instant}>
      <ChatContent
        key={chatKey}
        isOpen={isOpen}
        chatMode={chatMode}
        onClose={onClose}
        onOpenSettings={onOpenSettings}
      />
    </BottomSheet>
  );
}

interface ChatContentProps {
  isOpen: boolean;
  chatMode: ChatMode;
  onClose: () => void;
  onOpenSettings: () => void;
}

function ChatContent({ isOpen, chatMode, onClose, onOpenSettings }: ChatContentProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messageTimestamps = useRef<Map<string, Date>>(new Map());

  const db = usePGlite();
  const setChatMode = useSettingsStore((s) => s.setChatMode);

  const isCloudMode = chatMode.type === 'cloud';
  const canChat =
    chatMode.type === 'cloud' ||
    (chatMode.type === 'local' && chatMode.status === 'connected');

  const isLocalBlocked =
    chatMode.type === 'local' && chatMode.status !== 'connected';

  const executeLocalQuery = async (sql: string): Promise<string> => {
    try {
      return formatResults(await executeModelQuery(db, sql));
    } catch (err) {
      return formatQueryError(err);
    }
  };

  const transport = useMemo(
    () => createChatTransport(chatMode, executeLocalQuery),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chatMode, db]
  );

  const [input, setInput] = useState('');

  const {
    messages,
    sendMessage,
    status,
    error,
    addToolOutput,
  } = useChat<UIMessage>({
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onToolCall({ toolCall }) {
      if (!isCloudMode || toolCall.toolName !== 'queryDatabase') return;

      const toolInput = toolCall.input as { sql: string };
      executeModelQuery(db, toolInput.sql)
        .then((output) => {
          addToolOutput({
            tool: toolCall.toolName,
            toolCallId: toolCall.toolCallId,
            output: formatResults(output),
          });
        })
        .catch((err) => {
          addToolOutput({
            tool: toolCall.toolName,
            toolCallId: toolCall.toolCallId,
            output: formatQueryError(err),
          });
        });
    },
  });

  const isLoading = status === 'streaming' || status === 'submitted';

  useEffect(() => {
    messages.forEach((msg) => {
      if (!messageTimestamps.current.has(msg.id)) {
        messageTimestamps.current.set(msg.id, new Date());
      }
    });
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    messagesEndRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!isOpen || !window.matchMedia('(min-width: 768px)').matches) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 250);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  const handleOpenSettings = () => {
    onClose();
    setTimeout(onOpenSettings, 200);
  };

  const onFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || !canChat) return;
    sendMessage({ text: input });
    setInput('');
  };

  const errorMessage = getErrorMessage(error, chatMode);

  return (
    <div className="relative flex h-[72vh] flex-col overflow-hidden sm:h-full">
        <div className="flex items-center justify-between border-b border-border px-5 pb-4 pr-16 sm:px-8 sm:pt-4">
          <div>
            <p className="text-xs text-accent">$ ask</p>
            <h2 className="mt-1 text-lg font-semibold tracking-[-0.025em]">ask your ledger</h2>
          </div>
          <ChatBadge mode={chatMode} />
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 sm:px-8" aria-live="polite">
          {messages.length === 0 ? (
            <div className="space-y-4">
              {chatMode.type === 'off' && (
                <div className="tui-box space-y-2 p-4">
                  <p className="text-sm font-semibold">chat is disabled</p>
                  <p className="text-xs leading-5 text-muted-foreground">
                    open{' '}
                    <button
                      onClick={handleOpenSettings}
                      className="rounded font-semibold text-accent hover:underline"
                    >
                      [settings]
                    </button>
                    {' '}to choose a local or cloud model.
                  </p>
                </div>
              )}

              {canChat && (
                <SuggestedQuestions onSelect={setInput} />
              )}
            </div>
          ) : (
            <>
              {messages.map((message, index) => (
                <ChatMessage
                  key={message.id}
                  message={message}
                  createdAt={messageTimestamps.current.get(message.id)}
                  isStreaming={
                    isLoading &&
                    message.role === 'assistant' &&
                    index === messages.length - 1
                  }
                />
              ))}
              {isLoading && (() => {
                const lastMsg = messages[messages.length - 1];
                const lastMsgContent = lastMsg?.parts?.filter((p) => p.type === 'text').map((p) => p.text).join('') || '';
                const showCursor = lastMsg?.role === 'user' || (lastMsg?.role === 'assistant' && !lastMsgContent);
                return showCursor ? (
                  <div className="flex justify-start">
                    <div className="border border-border bg-surface px-3.5 py-2.5 text-xs">
                      <span className="mr-1 text-muted-foreground">thinking…</span>
                      <span className="cursor-blink"></span>
                    </div>
                  </div>
                ) : null;
              })()}
            </>
          )}

          {errorMessage && (
            <div className="flex justify-start">
              <div className="border border-destructive/40 bg-destructive-muted px-3.5 py-2.5">
                <span className="text-xs leading-5 text-destructive">{errorMessage}</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={onFormSubmit} className="border-t border-border p-4 sm:px-8 sm:pb-6">
          <div className="flex gap-2">
            <div className="flex flex-1 items-center border border-border bg-surface focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
              <input
                ref={inputRef}
                name="chat-question"
                type="text"
                autoComplete="off"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={canChat ? 'ask anything…' : 'chat unavailable'}
                disabled={isLoading || !canChat}
                className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-base placeholder:text-muted-foreground focus:outline-none disabled:opacity-50 sm:text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={!input.trim() || isLoading || !canChat}
              className="tui-btn-primary px-4 py-2 text-xs disabled:opacity-30"
            >
              {canChat ? '[send]' : '—'}
            </button>
          </div>
        </form>

        {isLocalBlocked && (
          <BlockedOverlay
            chatMode={chatMode}
            onOpenSettings={handleOpenSettings}
            onUseCloud={() => setChatMode('cloud')}
          />
        )}
    </div>
  );
}
