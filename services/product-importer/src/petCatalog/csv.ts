import { readFile } from 'node:fs/promises';

import {
  DEFAULT_CATALOG_CURRENCY,
  DEFAULT_CATALOG_LOCALE,
  DEFAULT_CATALOG_MARKET,
  PET_GROUPS,
  PetGroup,
  ProductSearchQuery,
} from './types.js';

export function parseCsv(text: string): Record<string, string>[] {
  const rows = splitCsvRows(text.replace(/^\uFEFF/, ''));
  const header = rows.shift();
  if (!header) return [];
  return rows
    .filter((row) => row.some((value) => value.trim().length > 0))
    .map((row) => Object.fromEntries(header.map((key, index) => [key, row[index] ?? ''])));
}

export async function loadProductSearchQueries(filePath: string): Promise<ProductSearchQuery[]> {
  const rows = parseCsv(await readFile(filePath, 'utf8'));
  return rows.map((row, index) => {
    if (!isPetGroup(row.pet_group)) {
      throw new Error(`Invalid pet_group at product_search_queries.csv row ${index + 2}: ${row.pet_group}`);
    }
    const priority = parsePositiveInteger(row.priority, 'priority', index);
    const maxPages = parsePositiveInteger(row.max_pages, 'max_pages', index);
    return {
      id: requireValue(row.id, 'id', index),
      petGroup: row.pet_group,
      targetSpecies: optional(row.target_species),
      targetSpeciesGroup: optional(row.target_species_group),
      categoryId: requireValue(row.category_id, 'category_id', index),
      subcategoryId: requireValue(row.subcategory_id, 'subcategory_id', index),
      keyword: requireValue(row.keyword, 'keyword', index),
      negativeKeywords: splitList(row.negative_keywords),
      rakutenGenreId: optional(row.rakuten_genre_id),
      yahooGenreCategoryId: optional(row.yahoo_genre_category_id),
      yahooBrandId: optional(row.yahoo_brand_id),
      priority,
      enabled: row.enabled.toLowerCase() === 'true',
      maxPages,
      locale: parseLocale(row.locale, index),
      marketCode: parseUppercaseCode(row.market_code, 'market_code', 2, DEFAULT_CATALOG_MARKET, index),
      currencyCode: parseUppercaseCode(row.currency_code, 'currency_code', 3, DEFAULT_CATALOG_CURRENCY, index),
      lastSearchedAt: optional(row.last_searched_at),
    };
  });
}

function parseLocale(value: string | undefined, rowIndex: number): string {
  const locale = optional(value) ?? DEFAULT_CATALOG_LOCALE;
  if (!/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(locale)) {
    throw new Error(`Invalid locale at product_search_queries.csv row ${rowIndex + 2}: ${value}`);
  }
  return locale;
}

function parseUppercaseCode(
  value: string | undefined,
  column: string,
  length: number,
  fallback: string,
  rowIndex: number,
): string {
  const code = optional(value) ?? fallback;
  if (!new RegExp(`^[A-Z]{${length}}$`).test(code)) {
    throw new Error(`Invalid ${column} at product_search_queries.csv row ${rowIndex + 2}: ${value}`);
  }
  return code;
}

export function splitList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean);
}

function splitCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (character === ',' && !quoted) {
      row.push(value);
      value = '';
      continue;
    }
    if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(value);
      rows.push(row);
      row = [];
      value = '';
      continue;
    }
    value += character;
  }
  if (value.length > 0 || row.length > 0) {
    row.push(value);
    rows.push(row);
  }
  return rows;
}

function isPetGroup(value: string): value is PetGroup {
  return PET_GROUPS.includes(value as PetGroup);
}

function optional(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function requireValue(value: string | undefined, column: string, rowIndex: number): string {
  const normalized = optional(value);
  if (!normalized) throw new Error(`Missing ${column} at product_search_queries.csv row ${rowIndex + 2}`);
  return normalized;
}

function parsePositiveInteger(value: string | undefined, column: string, rowIndex: number): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    throw new Error(`Invalid ${column} at product_search_queries.csv row ${rowIndex + 2}: ${value}`);
  }
  return number;
}
