import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createJapaneseReadingGenerator,
  normalizeSearchReading,
} from './japaneseReading.js';

test('Japanese product names receive normalized hiragana readings', async () => {
  const getSearchReadings = await createJapaneseReadingGenerator();

  assert.deepEqual(getSearchReadings(['銀のスプーン', '子猫用']), [
    'ぎんのすぷーん',
    'こねこよう',
  ]);
});

test('search readings normalize katakana, width, case, and punctuation', () => {
  assert.equal(normalizeSearchReading(' ギンノスプーン（ＣＡＴ） '), 'ぎんのすぷーんcat');
});
