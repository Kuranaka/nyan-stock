import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { config } from '../config.js';

type Row = Record<string, string>;
const seedDirectory = path.join(config.repositoryRoot, 'services/product-importer/data/seed');
const legacyPath = path.join(seedDirectory, 'pet_products_seed.csv');
const additionsPath = path.join(seedDirectory, 'pet_products_coverage_additions.csv');

function parseCsv(text: string): Row[] {
  const rows: string[][] = []; let row: string[] = []; let value = ''; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]; const next = text[index + 1];
    if (character === '"') { if (quoted && next === '"') { value += '"'; index += 1; } else quoted = !quoted; }
    else if (character === ',' && !quoted) { row.push(value); value = ''; }
    else if ((character === '\n' || character === '\r') && !quoted) { if (character === '\r' && next === '\n') index += 1; row.push(value); rows.push(row); row = []; value = ''; }
    else value += character;
  }
  if (row.length || value) { row.push(value); rows.push(row); }
  const [header, ...body] = rows;
  return body.filter((values) => values.some(Boolean)).map((values) => Object.fromEntries(header.map((key, index) => [key.replace(/^\uFEFF/, ''), values[index]?.trim() ?? ''])));
}

function csv(rows: Row[]): string {
  const columns = Object.keys(rows[0] ?? {});
  const escape = (value: string) => /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  return `\uFEFF${[columns.join(','), ...rows.map((row) => columns.map((column) => escape(row[column] ?? '')).join(','))].join('\n')}\n`;
}

async function main(): Promise<void> {
  const [legacyText, additionsText] = await Promise.all([readFile(legacyPath, 'utf8'), readFile(additionsPath, 'utf8')]);
  const legacy = parseCsv(legacyText); const additions = parseCsv(additionsText);
  const existing = new Set(legacy.map((row) => `${row.pet_type}|${row.product_name}`));
  const existingCoverageCount = legacy.filter((row) => row.product_id.startsWith('pet_coverage_')).length;
  let added = 0;
  for (const addition of additions) {
    if (existing.has(`${addition.pet_type}|${addition.product_name}`)) continue;
    const row: Row = Object.fromEntries(Object.keys(legacy[0]).map((column) => [column, '']));
    Object.assign(row, addition, {
      product_id: `pet_coverage_${String(existingCoverageCount + added + 1).padStart(4, '0')}`,
      parent_product_id: '', base_product_name: addition.product_name, brand_id: `brand_${addition.manufacturer}`, brand_name: addition.manufacturer,
      category_name: addition.subcategory_name, product_type: 'プロダクト', variations_or_target: '容量違いは統合', priority: 'B',
      note: '必須カテゴリ網羅のためメーカー公式カタログから追加。', is_active: 'true', content_amount: '該当なし', flavor: '該当なし', scent: '該当なし', variant_source: 'official_catalog', split_status: 'content_variants_collapsed', needs_research: 'false', review_reason: '',
    });
    legacy.push(row); existing.add(`${addition.pet_type}|${addition.product_name}`); added += 1;
  }
  await writeFile(legacyPath, csv(legacy), 'utf8');
  console.log(`[pet-master:merge-coverage] added=${added} legacy_rows=${legacy.length}`);
}

void main();
