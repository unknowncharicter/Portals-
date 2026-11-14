import { defineConfig } from 'vite';

// Relative base so the built game works from any folder (CrazyGames upload).
export default defineConfig({
  base: './',
  build: { outDir: 'dist', assetsInlineLimit: 0, chunkSizeWarningLimit: 2000 },
});
