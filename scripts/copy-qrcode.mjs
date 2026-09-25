#!/usr/bin/env node
/**
 * prebuild 脚本 — 把 qrcode (CommonJS) 用 esbuild 打包成单文件 ES Module，
 * 输出到 .qrcode-build/qrcode.js，由 vite-plugin-static-copy 复制到 dist/vendor/qrcode/。
 *
 * 为什么不直接复制 qrcode 的 lib/：
 *   qrcode@1.x 是纯 CJS（require），浏览器 ES Module 没法直接 import。
 *   esbuild --bundle --format=esm 能把 CJS 转 ESM，并自动卷进所有内部依赖，
 *   输出一个无外部 import 的单文件，浏览器可直接 <script type="module"> 加载。
 *
 * 与 copy-zxcvbn-ts.mjs 的区别：
 *   zxcvbn-ts 自带 dist/*.mjs（已编译好的 ESM），只需重命名 .mjs → .js。
 *   qrcode 没有预构建 ESM，必须先打包一次。
 */
import { execFileSync } from 'node:child_process';
import { existsSync, statSync, rmSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(HERE, '..');
const SRC = join(ROOT, 'node_modules', 'qrcode', 'lib', 'browser.js');
const DEST_DIR = join(ROOT, '.qrcode-build');
const DEST_FILE = join(DEST_DIR, 'qrcode.js');
const ESBUILD_BIN = join(ROOT, 'node_modules', '.bin', 'esbuild');

if (!existsSync(SRC)) {
  console.error(`copy-qrcode: missing ${SRC}, did you run npm install?`);
  process.exit(1);
}
if (!existsSync(ESBUILD_BIN)) {
  console.error(`copy-qrcode: missing ${ESBUILD_BIN}, esbuild not installed (vite should bring it)`);
  process.exit(1);
}

// 清理旧产物，避免 stale bundle
rmSync(DEST_DIR, { recursive: true, force: true });
mkdirSync(DEST_DIR, { recursive: true });

// 通过 CLI 调用 esbuild，避免 ESM/CJS interop 问题；
// --external:fs / --external:path 防止 esbuild 把 Node 内置包卷进来。
try {
  execFileSync(ESBUILD_BIN, [
    SRC,
    '--bundle',
    '--format=esm',
    '--platform=browser',
    '--target=es2020',
    '--minify',
    '--legal-comments=none',
    `--outfile=${DEST_FILE}`,
    '--external:fs',
    '--external:path',
  ], { stdio: ['ignore', 'inherit', 'inherit'] });
} catch (err) {
  console.error('copy-qrcode: esbuild failed');
  process.exit(1);
}

// 清掉 macOS 自动生成的 AppleDouble 元数据（._*），避免 viteStaticCopy 一起复制过去。
// 与 copy-zxcvbn-ts.mjs 中的处理方式一致。
function cleanAppleDouble(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('._')) {
      rmSync(join(dir, entry.name));
    }
  }
}
cleanAppleDouble(DEST_DIR);

const size = statSync(DEST_FILE).size;
console.log(`✓ copy-qrcode: ${DEST_FILE} (${(size / 1024).toFixed(1)} KB)`);