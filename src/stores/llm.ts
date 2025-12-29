import { create } from 'zustand';

const PROXY_URL = 'https://wakaru-api.ienioladewumi.workers.dev';

interface LLMState {
  generateSQL: (question: string) => Promise<string>;
  generateAnswer: (question: string, results: string) => Promise<string>;
}

export const useLLMStore = create<LLMState>(() => ({
  generateSQL: async (question: string) => {
    const response = await fetch(`${PROXY_URL}/api/sql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    });
    
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error((data as { error?: string }).error || 'Failed to generate SQL');
    }
    
    const data = await response.json() as { sql?: string; error?: string };
    if (data.error) throw new Error(data.error);
    if (!data.sql) throw new Error('No SQL returned');
    
    return data.sql;
  },
  
  generateAnswer: async (question: string, results: string) => {
    const response = await fetch(`${PROXY_URL}/api/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, results }),
    });
    
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error((data as { error?: string }).error || 'Failed to generate answer');
    }
    
    const data = await response.json() as { answer?: string; error?: string };
    if (data.error) throw new Error(data.error);
    if (!data.answer) throw new Error('No answer returned');
    
    return data.answer;
  },
}));
