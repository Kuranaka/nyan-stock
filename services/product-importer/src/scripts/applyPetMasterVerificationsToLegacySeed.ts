import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { config } from '../config.js';

type Row = Record<string, string>;

const seedDirectory = path.join(config.repositoryRoot, 'services/product-importer/data/seed');
const legacyPath = path.join(seedDirectory, 'pet_products_seed.csv');
const masterPath = path.join(seedDirectory, 'pet-master/pet_products_seed.csv');

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

function key(row: Row, nameColumn: 'product_name' | 'product_name_ja'): string {
  return `${row.pet_type}|${row[nameColumn]}`;
}

async function main(): Promise<void> {
  const [legacyText, masterText] = await Promise.all([readFile(legacyPath, 'utf8'), readFile(masterPath, 'utf8')]);
  const legacyRows = parseCsv(legacyText);
  const masterByKey = new Map(parseCsv(masterText).map((row) => [key(row, 'product_name_ja'), row]));
  let updated = 0;

  for (const legacy of legacyRows) {
    const master = masterByKey.get(key(legacy, 'product_name'));
    if (!master) continue;
    legacy.needs_research = 'false';
    legacy.review_reason = '';
    legacy.verification_status = master.source_status;
    legacy.verified_source_url = master.official_url;
    legacy.verified_note = master.notes;
    legacy.verified_at = '2026-07-19';
    legacy.is_active = master.status === 'verified_active' ? 'true' : 'false';
    updated += 1;
  }

  await writeFile(legacyPath, csv(legacyRows), 'utf8');
  console.log(`[pet-master:apply-verifications] updated=${updated} legacy_rows=${legacyRows.length}`);
}

void main();
