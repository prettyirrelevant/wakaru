import { create } from 'zustand';
import type { Theme } from '~/types';
import { getDb, getSetting, setSetting } from '~/lib/db';

interface SettingsState {
  theme: Theme;
  chatEnabled: boolean;
  isInitialized: boolean;

  init: () => Promise<void>;
  setTheme: (theme: Theme) => void;
  setChatEnabled: (enabled: boolean) => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  theme: 'system',
  chatEnabled: false,
  isInitialized: false,

  init: async () => {
    if (get().isInitialized) return;

    const db = getDb();
    const theme = await getSetting<Theme>(db, 'theme');
    const chatEnabled = await getSetting<boolean>(db, 'chatEnabled');

    set({
      theme: theme ?? 'system',
      chatEnabled: chatEnabled ?? false,
      isInitialized: true,
    });
  },

  setTheme: (theme) => {
    set({ theme });
    const db = getDb();
    setSetting(db, 'theme', theme);
  },

  setChatEnabled: (chatEnabled) => {
    set({ chatEnabled });
    const db = getDb();
    setSetting(db, 'chatEnabled', chatEnabled);
  },
}));
