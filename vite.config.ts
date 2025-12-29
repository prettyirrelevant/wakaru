import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { execSync } from 'child_process';

const gitSha = execSync('git rev-parse --short HEAD').toString().trim();

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
});
