import { create } from 'zustand';
import type { Theme, DeviceCapability } from '~/types';
import { getSetting, setSetting } from '~/lib/db';

export type AIProvider = 'none' | 'cloud' | 'local';

interface SettingsState {
  theme: Theme;
  capability: DeviceCapability | null;
  aiProvider: AIProvider;
  isInitialized: boolean;

  init: () => Promise<void>;
  setTheme: (theme: Theme) => void;
  setCapability: (capability: DeviceCapability) => void;
  setAIProvider: (provider: AIProvider) => void;
  refreshCapability: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  theme: 'system',
  capability: null,
  aiProvider: 'none',
  isInitialized: false,

  init: async () => {
    if (get().isInitialized) return;

    const theme = await getSetting<Theme>('theme');
    const capability = await getSetting<DeviceCapability>('capability');
    const aiProvider = await getSetting<AIProvider>('aiProvider');

    set({
      theme: theme ?? 'system',
      capability: capability ?? null,
      aiProvider: aiProvider ?? 'none',
      isInitialized: true,
    });

    // Check if we need to refresh capability
    if (!capability || shouldRefreshCapability(capability)) {
      get().refreshCapability();
    }
  },

  setTheme: (theme) => {
    set({ theme });
    setSetting('theme', theme);
  },

  setCapability: (capability) => {
    set({ capability });
    setSetting('capability', capability);
  },

  setAIProvider: (aiProvider) => {
    set({ aiProvider });
    setSetting('aiProvider', aiProvider);
  },

  refreshCapability: async () => {
    const capability = await detectDeviceCapability();
    get().setCapability(capability);
  },
}));

function shouldRefreshCapability(capability: DeviceCapability): boolean {
  const now = Date.now();
  const hoursSinceLastCheck = (now - capability.lastChecked) / 3600000;
  const currentFingerprint = getDeviceFingerprint();

  // Refresh if fingerprint changed (different device) or > 24 hours old
  return (
    capability.fingerprint !== currentFingerprint || hoursSinceLastCheck > 24
  );
}

function getDeviceFingerprint(): string {
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  const cores = navigator.hardwareConcurrency ?? 4;
  const screenSize = `${screen.width}x${screen.height}`;
  return `${memory}-${cores}-${screenSize}`;
}

async function detectDeviceCapability(): Promise<DeviceCapability> {
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  const cores = navigator.hardwareConcurrency ?? 4;

  let hasWebGPU = false;
  if ('gpu' in navigator) {
    try {
      const adapter = await (navigator as Navigator & { gpu: { requestAdapter: () => Promise<unknown> } }).gpu.requestAdapter();
      hasWebGPU = !!adapter;
    } catch {
      hasWebGPU = false;
    }
  }

  let tier: DeviceCapability['tier'] = 'basic';
  if (hasWebGPU && memory >= 8) {
    tier = 'powerful';
  } else if (memory >= 4 && cores >= 4) {
    tier = 'standard';
  }

  return {
    tier,
    hasWebGPU,
    memory,
    cores,
    lastChecked: Date.now(),
    fingerprint: getDeviceFingerprint(),
  };
}
