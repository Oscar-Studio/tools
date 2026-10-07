import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { seoInject } from './vite-plugin-seo-inject';

export default defineConfig({
  base: '/',
  plugins: [
    react(),
    seoInject(),
    viteStaticCopy({
      targets: [
        { src: 'tools-config.json', dest: '.' },
        { src: 'legacy-tools/*', dest: '.' },
        { src: 'CNAME', dest: '.' },
        // zxcvbn-ts 第三方包：scripts/copy-zxcvbn-ts.mjs prebuild 已把 dist/ 完整（含子目录 + 已过滤 ._*/.map）
        // 拷贝到 .zxcvbn-ts-build/<pkg>/。这里用 /* 让目录内容（含子目录）直接展平到 dest。
        { src: '.zxcvbn-ts-build/core/*', dest: 'vendor/zxcvbn-ts/core' },
        { src: '.zxcvbn-ts-build/language-common/*', dest: 'vendor/zxcvbn-ts/language-common' },
        { src: '.zxcvbn-ts-build/language-en/*', dest: 'vendor/zxcvbn-ts/language-en' },
        // zxcvbn-ts 的 utils/levenshtein.mjs 依赖 fastest-levenshtein（bare specifier），
        // 由 copy-zxcvbn-ts.mjs prebuild 拷到 .zxcvbn-ts-build/levenshtein/mod.js（.mjs → .js 重命名）。
        { src: '.zxcvbn-ts-build/levenshtein/*', dest: 'vendor/levenshtein' },
        // 语言包依赖 @zxcvbn-ts/dictionary-compression/decompress（解压词典数据）。
        { src: '.zxcvbn-ts-build/dictionary-compression/*', dest: 'vendor/dictionary-compression' },
        // qrcode：scripts/copy-qrcode.mjs prebuild 已用 esbuild 把 CJS 打成 ESM bundle 到 .qrcode-build/qrcode.js。
        { src: '.qrcode-build/*', dest: 'vendor/qrcode' },
      ],
    }),
  ],
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});