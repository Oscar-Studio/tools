#!/usr/bin/env node
/**
 * prebuild 脚本 — 把 zxcvbn-ts 三个包的 dist/ 整个复制到 .zxcvbn-ts-build/<pkg>/，
 * 让 vite-plugin-static-copy 能以无前缀路径 glob 到正确的 dest。
 *
 * 同时把全部 .mjs 重命名为 .js,因为 nginx 默认 mime.types 不包含 .mjs,
 * 返回 application/octet-stream,浏览器拒绝作为 ES module 加载。
 * （参考: codec 站点的 .js 文件返回 application/javascript,而 .mjs 报 octet-stream。）
 *
 * 为什么不在 vite config 里直接 glob node_modules：
 *   structured:true 会保留 src 前缀（node_modules/@zxcvbn-ts/core/dist/...），
 *   导致 dest 下出现多层冗余目录；structured:false 又会丢掉子目录结构，
 *   让 zxcvbn-ts 内部 `import './data/const.mjs'` 找不到文件。
 *   折中：先复制到 .zxcvbn-ts-build/（无 node_modules 前缀），再让 staticCopy 拷贝。
 */
import { readdir, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(HERE, '..');
const PKGS = ['core', 'language-common', 'language-en'];
const SRC_BASE = join(ROOT, 'node_modules', '@zxcvbn-ts');
const DEST_BASE = join(ROOT, '.zxcvbn-ts-build');

// 递归遍历 dest 目录,把 .mjs 文件重命名为 .js,同时改内部 import 字符串中的 .mjs 引用。
async function renameMjsToJs(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const renamePairs = [];
  for (const entry of entries) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      await renameMjsToJs(p);
    } else if (entry.isFile() && entry.name.endsWith('.mjs')) {
      renamePairs.push({ from: p, to: p.slice(0, -4) + '.js' });
    }
  }
  // 先全部读+写新文件,然后删除旧文件(避免读到中间状态)
  for (const { from, to } of renamePairs) {
    let content = await readFile(from, 'utf8');
    // 把内部 import 路径中的 .mjs 改为 .js(相对路径)
    content = content.replace(/from\s+['"](\.{1,2}\/[^'"]+)\.mjs['"]/g, 'from \'$1.js\'');
    await writeFile(to, content);
    await rm(from);
  }
}

/** 递归拷贝 src 到 dest,只保留浏览器需要的 .mjs / .json,跳过 macOS 元数据、source map、CJS 与 .d.ts。 */
async function copyDirFiltered(src, dest) {
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const s = join(src, entry.name);
    const d = join(dest, entry.name);
    if (entry.name.startsWith('._')) continue;        // macOS AppleDouble
    if (entry.name.endsWith('.map')) continue;       // source map
    if (entry.name.endsWith('.cjs')) continue;        // Node CJS, 浏览器不需要
    if (entry.name.endsWith('.d.ts')) continue;       // 类型声明
    if (entry.isDirectory()) {
      await copyDirFiltered(s, d);
    } else if (entry.isFile() && (entry.name.endsWith('.mjs') || entry.name.endsWith('.json'))) {
      // 用 readFile/writeFile 替代 cp,避免 macOS cp 自动创建 ._* AppleDouble 元数据
      const buf = await readFile(s);
      await writeFile(d, buf);
    }
  }
}

// 同时把 fastest-levenshtein 的 ESM build 拷过来(zxcvbn-ts 的 utils/levenshtein.mjs 用了它)
const LEVENSHTEIN_SRC = join(ROOT, 'node_modules', 'fastest-levenshtein', 'esm', 'mod.js');
const LEVENSHTEIN_DEST = join(DEST_BASE, 'levenshtein', 'mod.mjs');

let missing = 0;
let totalFiles = 0;
for (const pkg of PKGS) {
  const src = join(SRC_BASE, pkg, 'dist');
  if (!existsSync(src)) {
    console.warn(`copy-zxcvbn-ts: missing ${src}, did you run npm install?`);
    missing++;
    continue;
  }
  const dest = join(DEST_BASE, pkg);
  await rm(dest, { recursive: true, force: true });
  await copyDirFiltered(src, dest);
  await renameMjsToJs(dest);
  totalFiles++;
}

// fastest-levenshtein
if (existsSync(LEVENSHTEIN_SRC)) {
  await mkdir(join(DEST_BASE, 'levenshtein'), { recursive: true });
  const buf = await readFile(LEVENSHTEIN_SRC);
  // 重命名 .mjs → .js
  await writeFile(LEVENSHTEIN_DEST.replace(/\.mjs$/, '.js'), buf);
  await rm(LEVENSHTEIN_DEST).catch(() => {});
  totalFiles++;
} else {
  console.warn(`copy-zxcvbn-ts: missing ${LEVENSHTEIN_SRC}, did you run npm install?`);
  missing++;
}

// @zxcvbn-ts/dictionary-compression/decompress（语言包用,解压词典数据）
const DICT_COMP_SRC = join(ROOT, 'node_modules', '@zxcvbn-ts', 'dictionary-compression', 'dist', 'decompress.mjs');
const DICT_COMP_DEST = join(DEST_BASE, 'dictionary-compression', 'decompress.mjs');
if (existsSync(DICT_COMP_SRC)) {
  await mkdir(join(DEST_BASE, 'dictionary-compression'), { recursive: true });
  const buf = await readFile(DICT_COMP_SRC);
  await writeFile(DICT_COMP_DEST.replace(/\.mjs$/, '.js'), buf);
  await rm(DICT_COMP_DEST).catch(() => {});
  totalFiles++;
} else {
  console.warn(`copy-zxcvbn-ts: missing ${DICT_COMP_SRC}, did you run npm install?`);
  missing++;
}

if (missing > 0 && missing === PKGS.length) {
  console.error('copy-zxcvbn-ts: no packages found, exiting 1');
  process.exit(1);
}
console.log(`✓ copy-zxcvbn-ts: ${totalFiles}/${PKGS.length} packages copied`);