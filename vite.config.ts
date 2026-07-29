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
        { src: 'markdown-editor/*', dest: 'markdown-editor' },
        { src: 'CNAME', dest: '.' },
      ],
    }),
  ],
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});