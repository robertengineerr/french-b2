import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the same build works on GitHub Pages (/french-b2/),
// on a custom domain at the root, or in a subfolder on your own server.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { outDir: 'dist' },
});
