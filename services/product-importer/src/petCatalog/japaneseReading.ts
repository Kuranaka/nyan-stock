import { createRequire } from 'node:module';
import path from 'node:path';

import type { IpadicFeatures, Tokenizer } from 'kuromoji';

export type JapaneseReadingGenerator = (values: readonly string[]) => string[];

const require = createRequire(import.meta.url);
const kuromoji = require('kuromoji') as typeof import('kuromoji');
const kuromojiDictionaryPath = path.resolve(
  path.dirname(require.resolve('kuromoji')),
  '../dict',
);

export async function createJapaneseReadingGenerator(): Promise<JapaneseReadingGenerator> {
  const tokenizer = await new Promise<Tokenizer<IpadicFeatures>>((resolve, reject) => {
    kuromoji.builder({ dicPath: kuromojiDictionaryPath }).build((error, builtTokenizer) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(builtTokenizer);
    });
  });
  const cache = new Map<string, string>();

  return (values) =>
    unique(
      values
        .filter((value) => containsJapaneseText(value))
        .map((value) => {
          const cached = cache.get(value);
          if (cached !== undefined) return cached;
          const reading = normalizeSearchReading(
            tokenizer
              .tokenize(value.normalize('NFKC'))
              .map((token) => token.reading ?? token.surface_form)
              .join(''),
          );
          cache.set(value, reading);
          return reading;
        })
        .filter(Boolean),
    );
}

export function normalizeSearchReading(value: string): string {
  return katakanaToHiragana(value.normalize('NFKC'))
    .toLowerCase()
    .replace(/[\s\-_/・,，.。()（）[\]【】]/g, '');
}

function katakanaToHiragana(value: string): string {
  return value.replace(/[ァ-ヶ]/g, (character) =>
    String.fromCharCode(character.charCodeAt(0) - 0x60),
  );
}

function containsJapaneseText(value: string): boolean {
  return /[ぁ-んァ-ヶ一-龯々〆ヵヶ]/.test(value);
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
