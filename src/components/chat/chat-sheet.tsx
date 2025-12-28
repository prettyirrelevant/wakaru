import { useState, useRef, useEffect, useCallback } from 'react';
import { BottomSheet } from '~/components/ui';
import { useTransactionStore } from '~/stores/transactions';
import { useSettingsStore } from '~/stores/settings';
import { useEmbeddingStore } from '~/stores/embeddings';
import { useLLMStore } from '~/stores/llm';
import { executeQuery, parseQueryFromLLM } from '~/lib/chat/dsl';
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
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const transactions = useTransactionStore((s) => s.transactions);
  const aiProvider = useSettingsStore((s) => s.aiProvider);

  // Embedding store for semantic search
  const embeddingStatus = useEmbeddingStore((s) => s.status);
  const searchEmbeddings = useEmbeddingStore((s) => s.search);

  // LLM store
  const localLLMStatus = useLLMStore((s) => s.localStatus);
  const generateQueryLocal = useLLMStore((s) => s.generateQueryLocal);
  const generateQueryCloud = useLLMStore((s) => s.generateQueryCloud);

  // Determine chat level and readiness
  const isSemanticReady = embeddingStatus.stage === 'ready';
  const isLocalReady = localLLMStatus.stage === 'ready';
  const isCloudReady = aiProvider === 'cloud'; // Cloud is always ready
  const isAIReady = (aiProvider === 'local' && isLocalReady) || isCloudReady;

  // Chat level display
  const getChatLevel = () => {
    if (aiProvider === 'none') return 'basic';
    if (aiProvider === 'cloud') return 'cloud';
    if (aiProvider === 'local' && isLocalReady) return 'local';
    if (aiProvider === 'local' && localLLMStatus.stage === 'loading') return 'loading...';
    return 'basic';
  };

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when sheet opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  // Generate query using selected provider
  const generateQuery = useCallback(async (question: string): Promise<string> => {
    if (aiProvider === 'cloud') {
      return generateQueryCloud(question);
    } else if (aiProvider === 'local' && isLocalReady) {
      return generateQueryLocal(question);
    }
    throw new Error('AI not available');
  }, [aiProvider, isLocalReady, generateQueryCloud, generateQueryLocal]);

  // Process with AI (cloud or local)
  const processWithAI = useCallback(async (query: string): Promise<string> => {
    // Generate DSL query from AI
    let aiOutput: string;
    try {
      aiOutput = await generateQuery(query);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (message.includes('Rate limit')) {
        throw new Error('Too many requests. Please wait a moment and try again.');
      }
      if (message.includes('not initialized')) {
        throw new Error('Local AI is still loading. Please wait for it to finish.');
      }
      throw new Error(`AI request failed: ${message}`);
    }
    
    const parsedQuery = parseQueryFromLLM(aiOutput);
    
    if (!parsedQuery) {
      // Log for debugging
      console.warn('Failed to parse AI output:', aiOutput);
      throw new Error('AI returned an invalid response. Try a simpler question like "total spending" or "biggest expense".');
    }
    
    // If AI says we need semantic search, get matching transaction IDs
    if (parsedQuery.needsSemanticSearch && parsedQuery.semanticQuery && isSemanticReady) {
      try {
        const searchQuery = parsedQuery.semanticQuery;
        const results = await searchEmbeddings(searchQuery, 50);
        
        if (results.length > 0) {
          const matchingIds = results
            .filter(r => r.score >= 0.25)
            .map(r => r.id);
          
          if (matchingIds.length > 0) {
            parsedQuery.filters = {
              ...parsedQuery.filters,
              ids: matchingIds,
            };
          }
        }
      } catch {
        // If semantic search fails, continue without it
      }
    }
    
    // Execute the DSL query
    const result = executeQuery(parsedQuery, transactions);
    
    return result.summary;
  }, [generateQuery, transactions, isSemanticReady, searchEmbeddings]);

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
    const query = input.trim();
    setInput('');
    setIsProcessing(true);

    try {
      if (!isAIReady) {
        throw new Error('Please select an AI provider in settings first.');
      }

      const response = await processWithAI(query);

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
    'biggest expense?',
    'how much on food?',
    'transport spending?',
  ];

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose}>
      <div className="flex max-h-[85vh] flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-accent">$</span>
            <h2 className="text-sm font-semibold">ask</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="tui-badge text-xs">{getChatLevel()}</span>
          </div>
        </div>

        {/* Local LLM Loading Progress */}
        {aiProvider === 'local' && localLLMStatus.stage === 'loading' && (
          <div className="px-4 py-2 border-b border-border">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span>{localLLMStatus.message || 'Loading AI model...'}</span>
              <span>{localLLMStatus.progress ?? 0}%</span>
            </div>
            <div className="h-1 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-accent transition-all duration-300"
                style={{ width: `${localLLMStatus.progress ?? 0}%` }}
              />
            </div>
          </div>
        )}

        {/* Embedding Progress */}
        {(embeddingStatus.stage === 'loading_model' || embeddingStatus.stage === 'embedding') && (
          <div className="px-4 py-2 border-b border-border">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span>
                {embeddingStatus.stage === 'loading_model' 
                  ? 'Loading search model...' 
                  : 'Indexing transactions...'}
              </span>
              <span>{embeddingStatus.progress ?? 0}%</span>
            </div>
            <div className="h-1 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-accent transition-all duration-300"
                style={{ width: `${embeddingStatus.progress ?? 0}%` }}
              />
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 ? (
            <div className="space-y-4">
              {/* AI not configured message */}
              {aiProvider === 'none' && (
                <div className="tui-box p-3 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    &gt; ai chat is not enabled
                  </p>
                  <p className="text-xs text-muted-foreground/70">
                    go to{' '}
                    <button
                      onClick={handleOpenSettings}
                      className="text-accent hover:underline"
                    >
                      [settings]
                    </button>
                    {' '}to pick a provider:
                  </p>
                  <ul className="text-xs text-muted-foreground/70 pl-2 space-y-0.5">
                    <li>• cloud - instant, uses internet</li>
                    <li>• local - offline, ~135mb download</li>
                  </ul>
                </div>
              )}

              {/* Suggested questions (only show if AI is available) */}
              {isAIReady && (
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
                  {aiProvider === 'cloud' ? 'asking cloud...' : 
                   aiProvider === 'local' ? 'ai thinking...' : 
                   'processing...'}
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

// Message bubble component with copy functionality
function MessageBubble({ message }: { message: ChatMessage }) {
  const [copied, setCopied] = useState(false);
  const isError = message.content.startsWith('err:');

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Get display content (remove "err:" prefix for cleaner display)
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
