import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  base: '/',
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        { src: 'tools-config.json', dest: '.' },
        { src: 'legacy-tools/*', dest: '.' },
        { src: 'legacy-tools/word-counter/*', dest: 'legacy-tools/word-counter' },
        { src: 'CNAME', dest: '.' },
      ],
    }),
  ],
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});