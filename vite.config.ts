import { defineConfig } from 'vite';

// base: './' so the build works from any sub-path (itch.io, GitHub Pages...)
export default defineConfig({
  base: './',
  server: { port: 5173, open: false },
  build: { outDir: 'dist', chunkSizeWarningLimit: 2000 },
});
