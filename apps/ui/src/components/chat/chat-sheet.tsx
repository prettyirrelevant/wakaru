import { useState, useRef, useEffect, useMemo } from 'react';
import { useChat } from '@ai-sdk/react';
import { lastAssistantMessageIsCompleteWithToolCalls } from 'ai';
import type { UIMessage } from 'ai';
import { usePGlite } from '@electric-sql/pglite-react';
import { BottomSheet } from '~/components/ui';
import { useSettingsStore } from '~/stores/settings';
import { executeQuery } from '~/lib/db';
import type { ChatMode } from '~/types';
import { ChatBadge } from './chat-badge';
import { ChatMessage } from './chat-message';
import { SuggestedQuestions } from './suggested-questions';
import { BlockedOverlay } from './blocked-overlay';
import { formatResults, getErrorMessage, getChatKey } from '~/lib/chat/utils';
import { createChatTransport } from '~/lib/chat/transport';

interface ChatSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
}

export function ChatSheet({ isOpen, onClose, onOpenSettings }: ChatSheetProps) {
  const chatMode = useSettingsStore((s) => s.chatMode);
  const chatKey = getChatKey(chatMode);

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose}>
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
      const { columns, rows } = await executeQuery(db, sql);
      return formatResults(columns, rows);
    } catch (err) {
      return `Error executing query: ${err instanceof Error ? err.message : 'Unknown error'}`;
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
      executeQuery(db, toolInput.sql)
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
    },
  });

  const isLoading = status === 'streaming' || status === 'submitted';

  useEffect(() => {
    messages.forEach((msg) => {
      if (!messageTimestamps.current.has(msg.id)) {
        messageTimestamps.current.set(msg.id, new Date());
      }
    });
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
    if (!input.trim() || isLoading || !canChat) return;
    sendMessage({ text: input });
    setInput('');
  };

  const errorMessage = getErrorMessage(error, chatMode);

  return (
    <div className="relative flex h-[70vh] flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-4 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-accent">$</span>
            <h2 className="text-sm font-semibold">ask</h2>
          </div>
          <ChatBadge mode={chatMode} />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 ? (
            <div className="space-y-4">
              {chatMode.type === 'off' && (
                <div className="tui-box p-3 space-y-2">
                  <p className="text-xs text-muted-foreground">chat is disabled</p>
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
                    <div className="tui-box px-3 py-2 text-xs">
                      <span className="text-muted-foreground mr-1">&gt;</span>
                      <span className="text-muted-foreground/50 mr-1">thinking...</span>
                      <span className="cursor-blink"></span>
                    </div>
                  </div>
                ) : null;
              })()}
            </>
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
                placeholder={canChat ? 'ask anything...' : 'chat unavailable'}
                disabled={isLoading || !canChat}
                className="flex-1 bg-transparent px-2 py-2 text-base sm:text-xs placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
              />
            </div>
            <button
              type="submit"
              disabled={!input.trim() || isLoading || !canChat}
              className="tui-btn-primary px-3 py-2 text-xs disabled:opacity-30"
            >
              {canChat ? 'go' : '—'}
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
