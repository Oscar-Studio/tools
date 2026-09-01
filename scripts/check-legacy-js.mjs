#!/usr/bin/env node
/**
 * 在 vite build 之前对 legacy-tools/ 下所有 JS 文件做语法 sanity check。
 * vite-plugin-static-copy 只拷贝不解析，所以这些文件不会走 tsc/esbuild，
 * 一旦有 `}` 多 / 缺、非法 import，都得过线上才能发现。
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(HERE, '..');
const TARGET = join(ROOT, 'legacy-tools');

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.m?js$/.test(entry)) out.push(p);
  }
  return out;
}

const TARGET_STAT = statSync(TARGET, { throwIfNoEntry: false });
if (!TARGET_STAT) {
  console.log('check-legacy-js: no legacy-tools/, skipping');
  process.exit(0);
}

const files = walk(TARGET);
if (files.length === 0) {
  console.log('check-legacy-js: no JS files in legacy-tools/, skipping');
  process.exit(0);
}

let failed = 0;
for (const abs of files) {
  const rel = relative(ROOT, abs);
  try {
    execFileSync(process.execPath, ['--check', abs], { stdio: 'pipe' });
  } catch (err) {
    failed++;
    const stderr = err.stderr ? err.stderr.toString() : '';
    const firstErr = stderr.split('\n').find((l) => /SyntaxError|Error:/.test(l)) || 'unknown error';
    console.error(`  ✗ ${rel}\n    ${firstErr.trim()}`);
  }
}

if (failed > 0) {
  console.error(`\n❌ check-legacy-js: ${failed}/${files.length} files failed syntax check.`);
  process.exit(1);
}
console.log(`✓ check-legacy-js: ${files.length} files OK`);
