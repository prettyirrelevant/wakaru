import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { execSync } from 'child_process';

function getGitSha(): string {
  if (process.env.VERCEL_GIT_COMMIT_SHA) {
    return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7);
  }
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'dev';
  }
}

const gitSha = getGitSha();

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '~': resolve(__dirname, 'src'),
    },
  },
  define: {
    __GIT_SHA__: JSON.stringify(gitSha),
  },
  worker: {
    format: 'es',
  },
});
