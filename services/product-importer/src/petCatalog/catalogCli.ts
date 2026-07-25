import path from 'node:path';

import { config } from '../config.js';
import { loadProductSearchQueries } from './csv.js';
import { selectProductSearchQueries } from './querySelection.js';
import { ProductSearchQuery } from './types.js';

export type QuerySelectionCliOptions = {
  queryFile: string;
  queryIds: Set<string>;
  petGroup?: string;
  offsetQueries: number;
  limitQueries?: number;
};

export function parseQuerySelectionOptions(args: string[]): {
  selection: QuerySelectionCliOptions;
  remaining: string[];
} {
  const selection: QuerySelectionCliOptions = {
    queryFile: path.join(
      config.repositoryRoot,
      'services/product-importer/data/seed/pet-master/product_search_queries.csv',
    ),
    queryIds: new Set(),
    offsetQueries: 0,
  };
  const remaining: string[] = [];
  for (const argument of args) {
    if (argument.startsWith('--queries=')) selection.queryFile = path.resolve(argument.slice('--queries='.length));
    else if (argument.startsWith('--query-id=')) selection.queryIds.add(argument.slice('--query-id='.length));
    else if (argument.startsWith('--pet-group=')) selection.petGroup = argument.slice('--pet-group='.length);
    else if (argument.startsWith('--offset-queries=') || argument.startsWith('--offset=')) {
      const prefix = argument.startsWith('--offset-queries=') ? '--offset-queries=' : '--offset=';
      const value = Number(argument.slice(prefix.length));
      if (!Number.isInteger(value) || value < 0) throw new Error(`${prefix.slice(0, -1)} must be a non-negative integer.`);
      selection.offsetQueries = value;
    } else if (argument.startsWith('--limit-queries=')) {
      const value = Number(argument.slice('--limit-queries='.length));
      if (!Number.isInteger(value) || value < 1) throw new Error('--limit-queries must be a positive integer.');
      selection.limitQueries = value;
    } else remaining.push(argument);
  }
  return { selection, remaining };
}

export async function loadSelectedProductSearchQueries(
  options: QuerySelectionCliOptions,
): Promise<ProductSearchQuery[]> {
  const queries = selectProductSearchQueries(await loadProductSearchQueries(options.queryFile), options);
  if (queries.length === 0) {
    throw new Error(`No enabled product search queries matched the supplied filters after offset ${options.offsetQueries}.`);
  }
  return queries;
}
