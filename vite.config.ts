/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// @ts-ignore plain ESM module without type declarations (shared with server/index.mjs)
import { chatMiddleware } from './server/chat.mjs';

/** Serves GET /api/status and POST /api/chat from the Vite dev and preview servers. */
const capcomApi = {
  name: 'capcom-api',
  configureServer(server: { middlewares: { use: (fn: unknown) => void } }) {
    server.middlewares.use(chatMiddleware());
  },
  configurePreviewServer(server: { middlewares: { use: (fn: unknown) => void } }) {
    server.middlewares.use(chatMiddleware());
  },
};

export default defineConfig({
  plugins: [react(), capcomApi],
  server: { port: 5173, strictPort: true },
  // The lazily loaded 3D chunk (three.js inside model-viewer) is ~1 MB by nature.
  build: { chunkSizeWarningLimit: 1100 },
  test: { environment: 'node', globals: true },
});
