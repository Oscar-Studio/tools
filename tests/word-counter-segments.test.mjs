import assert from 'node:assert/strict';
import { segment } from '../legacy-tools/word-counter/js/segment.js';

const empty = segment('');
assert.equal(empty.entries.length, 0);
assert.equal(empty.total.tokens, 0);

const english = segment('The cat sat on the mat. The cat liked the mat.');
assert.equal(english.entries.find((entry) => entry.word === 'cat')?.count, 4);
assert.equal(english.entries.find((entry) => entry.word === 'mat')?.count, 4);

const mixed = segment('我们爱写作。写作让写作更清晰。OSCAR Studio 是 OSCAR Studio。');
assert.ok((mixed.entries.find((entry) => entry.word === '写作')?.count ?? 0) >= 2);
assert.ok(mixed.total.chinese >= 1);
assert.ok(mixed.total.english >= 1);

console.log('word-counter segment tests passed');
