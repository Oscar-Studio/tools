import assert from 'node:assert/strict';
import { countText, formatReadingTime } from '../legacy-tools/word-counter/js/stats.js';

assert.deepEqual(countText(''), {
  charactersWithSpaces: 0, charactersWithoutSpaces: 0, chineseCharacters: 0,
  englishWords: 0, digits: 0, punctuation: 0, lines: 0, paragraphs: 0,
  utf8Bytes: 0, readingMinutes: 0,
});

const stats = countText('你好， Oscar!\n\n42');
assert.equal(stats.charactersWithSpaces, 14);
assert.equal(stats.charactersWithoutSpaces, 11);
assert.equal(stats.chineseCharacters, 2);
assert.equal(stats.englishWords, 1);
assert.equal(stats.digits, 2);
assert.equal(stats.lines, 3);
assert.equal(stats.paragraphs, 2);
assert.equal(stats.utf8Bytes, new TextEncoder().encode('你好， Oscar!\n\n42').length);

const unicode = countText('😀 é');
assert.equal(unicode.charactersWithSpaces, 4);
assert.equal(unicode.charactersWithoutSpaces, 3);
assert.equal(unicode.englishWords, 1);
assert.equal(formatReadingTime(0), '0 min');
assert.equal(formatReadingTime(0.4), '<1 min');

console.log('word-counter stats tests passed');
