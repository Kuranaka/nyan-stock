export function isPositiveNumber(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function isValidOptionalUrl(value?: string) {
  if (!value) return true;
  return value.startsWith('http://') || value.startsWith('https://');
}

function getOptionalUrlHost(value?: string): string | undefined {
  if (!value) return undefined;
  if (!isValidOptionalUrl(value)) return '';
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function isHostOrSubdomain(host: string, domain: string) {
  return host === domain || host.endsWith(`.${domain}`);
}

export function isValidOptionalAmazonUrl(value?: string) {
  const host = getOptionalUrlHost(value);
  if (host === undefined) return true;
  return (
    isHostOrSubdomain(host, 'amazon.co.jp') ||
    isHostOrSubdomain(host, 'amazon.com') ||
    isHostOrSubdomain(host, 'amazon.co.uk') ||
    isHostOrSubdomain(host, 'amazon.de') ||
    isHostOrSubdomain(host, 'amazon.fr') ||
    isHostOrSubdomain(host, 'amazon.it') ||
    isHostOrSubdomain(host, 'amazon.es') ||
    isHostOrSubdomain(host, 'amazon.ca') ||
    isHostOrSubdomain(host, 'amazon.com.au') ||
    host === 'amzn.asia' ||
    host === 'a.co'
  );
}

export function isValidOptionalRakutenUrl(value?: string) {
  const host = getOptionalUrlHost(value);
  if (host === undefined) return true;
  return (
    isHostOrSubdomain(host, 'rakuten.co.jp') ||
    isHostOrSubdomain(host, 'rakuten.com') ||
    isHostOrSubdomain(host, 'rakuten.ne.jp') ||
    host === 'r10.to'
  );
}

export function isValidOptionalYahooShoppingUrl(value?: string) {
  const host = getOptionalUrlHost(value);
  if (host === undefined) return true;
  return isHostOrSubdomain(host, 'yahoo.co.jp') || isHostOrSubdomain(host, 'yahoo.jp');
}

export function parseOptionalNumber(value: string) {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function createId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
