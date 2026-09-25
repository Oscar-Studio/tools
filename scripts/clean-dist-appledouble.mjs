#!/usr/bin/env node
/**
 * postbuild 脚本 — 清掉 dist/ 下所有 macOS AppleDouble 元数据（._* 文件），
 * 避免打包到压缩包或 rsync 时混入。
 *
 * AppleDouble 是 macOS 在 SMB/AFP/U盘等非原生文件系统上自动生成的隐藏文件，
 * 与同名内容文件成对出现（._foo.png 对应 foo.png）。本地 ext4 上无意义，
 * 且部分 Linux 文件管理器会把它们当成"垃圾文件"显示。
 */
import { readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(HERE, '..');
const DIST = join(ROOT, 'dist');

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (entry.startsWith('._')) {
      out.push(p);            // 顶层 ._* 直接删
      continue;
    }
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
  }
  return out;
}

const st = statSync(DIST, { throwIfNoEntry: false });
if (!st) {
  console.log('clean-dist-appledouble: no dist/, skipping');
  process.exit(0);
}

const targets = walk(DIST);
let removed = 0;
for (const p of targets) {
  rmSync(p);
  removed++;
}
if (removed > 0) console.log(`✓ clean-dist-appledouble: removed ${removed} ._* files`);
else console.log('clean-dist-appledouble: no AppleDouble files found');