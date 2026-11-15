/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  // The lazily loaded 3D chunk (three.js inside model-viewer) is ~1 MB by nature.
  build: { chunkSizeWarningLimit: 1100 },
  test: { environment: 'node', globals: true },
});
