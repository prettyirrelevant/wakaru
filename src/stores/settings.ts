import { create } from 'zustand';
import type { Theme } from '~/types';
import { getSetting, setSetting } from '~/lib/db';

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

    const theme = await getSetting<Theme>('theme');
    const chatEnabled = await getSetting<boolean>('chatEnabled');

    set({
      theme: theme ?? 'system',
      chatEnabled: chatEnabled ?? false,
      isInitialized: true,
    });
  },

  setTheme: (theme) => {
    set({ theme });
    setSetting('theme', theme);
  },

  setChatEnabled: (chatEnabled) => {
    set({ chatEnabled });
    setSetting('chatEnabled', chatEnabled);
  },
}));
