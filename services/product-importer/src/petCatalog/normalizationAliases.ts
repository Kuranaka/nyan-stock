import { readFile } from 'node:fs/promises';

import { parseCsv } from './csv.js';
import { NormalizationAlias, NormalizationAliasType } from './types.js';

export async function loadNormalizationAliases(filePath: string): Promise<NormalizationAlias[]> {
  const rows = parseCsv(await readFile(filePath, 'utf8'));
  return rows.map((row, index) => {
    if (!isAliasType(row.alias_type)) {
      throw new Error(`Invalid alias_type at normalization_aliases_seed.csv row ${index + 2}: ${row.alias_type}`);
    }
    const alias = required(row.alias, 'alias', index);
    const priority = Number(row.priority);
    if (!Number.isInteger(priority) || priority < 0) {
      throw new Error(`Invalid priority at normalization_aliases_seed.csv row ${index + 2}: ${row.priority}`);
    }
    return {
      id: required(row.id, 'id', index),
      aliasType: row.alias_type,
      locale: required(row.locale, 'locale', index),
      alias,
      normalizedAlias: normalizeAlias(alias),
      canonicalValue: required(row.canonical_value, 'canonical_value', index),
      contextValue: optional(row.context_value),
      displayValue: optional(row.display_value),
      priority,
      enabled: row.enabled.toLowerCase() === 'true',
    };
  });
}

export function findNormalizationAliases(
  aliases: readonly NormalizationAlias[],
  aliasType: NormalizationAliasType,
  text: string,
  locale: string,
  contextValue?: string,
): NormalizationAlias[] {
  const normalizedText = normalizeAlias(text);
  return aliases
    .filter((item) => item.enabled && item.aliasType === aliasType)
    .filter((item) => aliasType !== 'series' || !item.contextValue || item.contextValue === contextValue)
    .filter((item) => aliasMatches(normalizedText, item.normalizedAlias))
    .sort((left, right) =>
      Number(right.locale === locale) - Number(left.locale === locale) ||
      right.priority - left.priority ||
      right.normalizedAlias.length - left.normalizedAlias.length ||
      left.id.localeCompare(right.id),
    );
}

export function normalizeAlias(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[‐‑‒–—―ー－]/g, '-').replace(/[\s　]+/g, ' ').trim();
}

function aliasMatches(text: string, alias: string): boolean {
  if (!alias) return false;
  if (/^[a-z0-9][a-z0-9 ._+-]*$/i.test(alias)) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, 'i').test(text);
  }
  return text.includes(alias);
}

function isAliasType(value: string): value is NormalizationAliasType {
  return ['species', 'brand', 'series'].includes(value);
}

function required(value: string | undefined, column: string, rowIndex: number): string {
  const result = optional(value);
  if (!result) throw new Error(`Missing ${column} at normalization_aliases_seed.csv row ${rowIndex + 2}`);
  return result;
}

function optional(value: string | undefined): string | undefined {
  const result = value?.trim();
  return result || undefined;
}
