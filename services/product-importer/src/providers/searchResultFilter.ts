const excludedProductNameTerms = ['犬', 'ドッグ'];

type ProductResultNameFilterOptions = {
  requiredNameParts?: string[];
};

export function isAllowedProductResultName(
  productName: string,
  options: ProductResultNameFilterOptions = {},
): boolean {
  if (containsExcludedProductNameTerm(productName)) return false;
  return includesAllRequiredNameParts(productName, options.requiredNameParts ?? []);
}

export function filterProductResultNames<T>(
  items: T[],
  getProductName: (item: T) => string | undefined,
  options: ProductResultNameFilterOptions = {},
): T[] {
  return items.filter((item) => {
    const productName = getProductName(item);
    return Boolean(productName && isAllowedProductResultName(productName, options));
  });
}

function containsExcludedProductNameTerm(productName: string): boolean {
  const normalizedName = normalizeForProductNameMatch(productName);
  return excludedProductNameTerms.some((term) => normalizedName.includes(normalizeForProductNameMatch(term)));
}

function includesAllRequiredNameParts(productName: string, requiredNameParts: string[]): boolean {
  const normalizedProductName = normalizeForProductNameMatch(productName);
  const requiredTerms = requiredNameParts
    .map(normalizeForProductNameMatch)
    .filter(Boolean);
  if (requiredTerms.length === 0) return true;
  return Array.from(new Set(requiredTerms)).every((term) => normalizedProductName.includes(term));
}

function normalizeForProductNameMatch(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s　\-_/・,，.。()（）[\]【】"'“”]+/g, '');
}
