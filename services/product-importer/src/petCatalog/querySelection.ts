import { ProductSearchQuery } from './types.js';

export type ProductSearchQuerySelectionOptions = {
  queryIds: ReadonlySet<string>;
  petGroup?: string;
  offsetQueries: number;
  limitQueries?: number;
};

export function selectProductSearchQueries(
  allQueries: ProductSearchQuery[],
  options: ProductSearchQuerySelectionOptions,
): ProductSearchQuery[] {
  const matched = allQueries
    .filter((query) => query.enabled)
    .filter((query) => options.queryIds.size === 0 || options.queryIds.has(query.id))
    .filter((query) => !options.petGroup || query.petGroup === options.petGroup)
    .sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id));
  const end = options.limitQueries === undefined ? undefined : options.offsetQueries + options.limitQueries;
  return matched.slice(options.offsetQueries, end);
}
