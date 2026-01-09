import { create } from 'zustand';
import type { Theme, ChatMode, ChatModeType, LocalChatMode } from '~/types';
import { getDb, getSetting, setSetting } from '~/lib/db';
import { fetchLocalServerModels } from '~/lib/ai/local-server-transport';

interface SettingsState {
  theme: Theme;
  isInitialized: boolean;
  chatMode: ChatMode;

  init: () => Promise<void>;
  setTheme: (theme: Theme) => void;
  setChatMode: (mode: ChatModeType) => void;
  setLocalServerUrl: (url: string) => void;
  setLocalServerModel: (model: string) => void;
  testLocalConnection: () => Promise<void>;
  disconnectLocalServer: () => void;
}

const DEFAULT_LOCAL_URL = 'http://localhost:11434/v1';

const createDefaultLocalMode = (url?: string, model?: string): LocalChatMode => ({
  type: 'local',
  status: 'idle',
  url: url ?? DEFAULT_LOCAL_URL,
  model: model ?? '',
  models: [],
  error: null,
});

export const useSettingsStore = create<SettingsState>((set, get) => ({
  theme: 'system',
  isInitialized: false,
  chatMode: { type: 'off' },

  init: async () => {
    if (get().isInitialized) return;

    const db = getDb();
    const theme = await getSetting<Theme>(db, 'theme');
    const savedModeType = await getSetting<ChatModeType>(db, 'chatModeType');
    const savedUrl = await getSetting<string>(db, 'localServerUrl');
    const savedModel = await getSetting<string>(db, 'localServerModel');

    let chatMode: ChatMode = { type: 'off' };

    if (savedModeType === 'cloud') {
      chatMode = { type: 'cloud' };
    } else if (savedModeType === 'local') {
      chatMode = createDefaultLocalMode(savedUrl, savedModel);
    }

    set({
      theme: theme ?? 'system',
      chatMode,
      isInitialized: true,
    });

    if (chatMode.type === 'local' && savedUrl && savedModel) {
      get().testLocalConnection();
    }
  },

  setTheme: (theme) => {
    set({ theme });
    const db = getDb();
    setSetting(db, 'theme', theme);
  },

  setChatMode: (mode) => {
    const db = getDb();
    setSetting(db, 'chatModeType', mode);

    if (mode === 'off') {
      set({ chatMode: { type: 'off' } });
    } else if (mode === 'cloud') {
      set({ chatMode: { type: 'cloud' } });
    } else if (mode === 'local') {
      const current = get().chatMode;
      if (current.type === 'local') {
        set({ chatMode: current });
      } else {
        const savedUrl = DEFAULT_LOCAL_URL;
        set({ chatMode: createDefaultLocalMode(savedUrl) });
      }
    }
  },

  setLocalServerUrl: (url) => {
    const current = get().chatMode;
    if (current.type !== 'local') return;

    set({
      chatMode: { ...current, url, status: 'idle', error: null },
    });
  },

  setLocalServerModel: (model) => {
    const current = get().chatMode;
    if (current.type !== 'local') return;

    const db = getDb();
    setSetting(db, 'localServerModel', model);
    set({
      chatMode: { ...current, model },
    });
  },

  testLocalConnection: async () => {
    const current = get().chatMode;
    if (current.type !== 'local') return;

    set({ chatMode: { ...current, status: 'testing', error: null } });

    const result = await fetchLocalServerModels(current.url);

    const latest = get().chatMode;
    if (latest.type !== 'local') return;

    if (result.ok && result.models) {
      const model = result.models.includes(latest.model)
        ? latest.model
        : result.models[0];

      const db = getDb();
      setSetting(db, 'localServerUrl', latest.url);
      setSetting(db, 'localServerModel', model);

      set({
        chatMode: {
          ...latest,
          status: 'connected',
          models: result.models,
          model,
          error: null,
        },
      });
    } else {
      set({
        chatMode: {
          ...latest,
          status: 'error',
          error: result.error ?? 'connection failed',
        },
      });
    }
  },

  disconnectLocalServer: () => {
    const current = get().chatMode;
    if (current.type !== 'local') return;

    set({
      chatMode: {
        ...current,
        status: 'idle',
        models: [],
        model: '',
        error: null,
      },
    });
  },
}));
