import { DefaultChatTransport } from 'ai';
import type { UIMessage, ChatTransport, UIMessageChunk } from 'ai';
import { LocalServerTransport } from '~/lib/ai/local-server-transport';
import type { ChatMode } from '~/types';
import { PROXY_URL } from './utils';

class BlockedTransport implements ChatTransport<UIMessage> {
  async sendMessages(): Promise<ReadableStream<UIMessageChunk>> {
    return new ReadableStream({
      start(controller) {
        controller.close();
      },
    });
  }

  async reconnectToStream(): Promise<ReadableStream<UIMessageChunk> | null> {
    return null;
  }
}

export function createChatTransport(
  chatMode: ChatMode,
  executeLocalQuery: (sql: string) => Promise<string>
): ChatTransport<UIMessage> {
  if (chatMode.type === 'cloud') {
    return new DefaultChatTransport<UIMessage>({ api: `${PROXY_URL}/api/chat` });
  }

  if (chatMode.type === 'local' && chatMode.status === 'connected') {
    return new LocalServerTransport(chatMode.url, chatMode.model, executeLocalQuery);
  }

  return new BlockedTransport();
}
