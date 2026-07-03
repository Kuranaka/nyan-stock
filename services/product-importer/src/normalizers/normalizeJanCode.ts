const gtinLengths = new Set([8, 12, 13, 14]);

export function normalizeJanCode(value: string | undefined): string | undefined {
  const gtin = normalizeGtin(value);
  if (!gtin) return undefined;
  return gtin.length === 8 || gtin.length === 13 ? gtin : undefined;
}

export function normalizeGtin(value: string | undefined): string | undefined {
  const digits = value?.replace(/\D/g, '') ?? '';
  if (!gtinLengths.has(digits.length)) return undefined;
  return hasValidGtinCheckDigit(digits) ? digits : undefined;
}

export function hasValidGtinCheckDigit(gtin: string): boolean {
  if (!/^\d+$/.test(gtin) || !gtinLengths.has(gtin.length)) return false;
  const checkDigit = Number(gtin.at(-1));
  const body = gtin.slice(0, -1);
  const sum = [...body]
    .reverse()
    .reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === checkDigit;
}
