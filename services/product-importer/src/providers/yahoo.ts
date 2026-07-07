import { config, delay, warnMissingEnv } from '../config.js';
import { normalizeJanCode } from '../normalizers/normalizeJanCode.js';
import { RawProduct } from '../types.js';
import { filterProductResultNames } from './searchResultFilter.js';

type YahooItem = {
  code?: string;
  name?: string;
  price?: number;
  url?: string;
  image?: {
    medium?: string;
    small?: string;
  };
  janCode?: string;
  seller?: {
    name?: string;
  };
  genreCategory?: {
    name?: string;
  };
  brand?: {
    name?: string;
  };
};

type YahooResponse = {
  hits?: YahooItem[];
  totalResultsAvailable?: number;
  error?: {
    message?: string;
  };
};

export const YAHOO_REQUEST_INTERVAL_MS = config.yahooRequestIntervalMs;

const yahooResponseCacheTtlMs = 5 * 60 * 1000;
const yahooResponseCache = new Map<string, { cachedAt: number; products: RawProduct[] }>();

let yahooRequestQueue = Promise.resolve();
let lastYahooRequestStartedAt = 0;
let yahooBlockedUntil = 0;

type ProductSearchOptions = {
  requiredNameParts?: string[];
};

export async function searchYahooItemsByKeyword(
  keyword: string,
  options: ProductSearchOptions = {},
): Promise<RawProduct[]> {
  return searchYahooItems({ query: keyword, requiredNameParts: options.requiredNameParts });
}

export async function searchYahooItemsByJanCode(janCode: string): Promise<RawProduct[]> {
  const normalizedJanCode = normalizeJanCode(janCode);
  if (!normalizedJanCode) {
    console.warn(`[yahoo] Invalid JAN/GTIN check digit or length: ${janCode}`);
    return [];
  }
  return searchYahooItems({ janCode: normalizedJanCode });
}

async function searchYahooItems(params: {
  query?: string;
  janCode?: string;
  requiredNameParts?: string[];
}): Promise<RawProduct[]> {
  if (!config.yahooClientId) {
    warnMissingEnv('yahoo', ['YAHOO_CLIENT_ID']);
    console.warn('[yahoo] Skipping Yahoo import because YAHOO_CLIENT_ID is required.');
    return [];
  }

  const searchParams = new URLSearchParams({
    appid: config.yahooClientId,
    results: '30',
  });
  if (params.query) searchParams.set('query', params.query);
  if (params.janCode) searchParams.set('jan_code', params.janCode);

  const url = `https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch?${searchParams.toString()}`;
  const cacheKey = url;
  const cached = yahooResponseCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < yahooResponseCacheTtlMs) {
    console.log(`[yahoo] cache hit: ${describeYahooSearchParams(params)}`);
    return cached.products;
  }

  const body = await fetchYahooResponse(url, describeYahooSearchParams(params));
  if (!body) return [];

  const fetchedAt = new Date().toISOString();
  const hits = body.hits ?? [];
  if (hits.length === 0) {
    console.warn(`[yahoo] 0 items. response keys: ${Object.keys(body).join(', ')}`);
  }
  const products = filterProductResultNames(
    hits.filter((item) => Boolean(item.code && item.name)),
    (item) => item.name,
    { requiredNameParts: params.requiredNameParts },
  )
    .map((item) => ({
      provider: 'yahoo' as const,
      externalId: item.code ?? '',
      rawName: item.name ?? '',
      brand: item.brand?.name,
      categoryText: item.genreCategory?.name,
      price: item.price,
      imageUrl: item.image?.medium ?? item.image?.small,
      url: item.url,
      janCode: normalizeJanCode(item.janCode),
      shopName: item.seller?.name,
      fetchedAt,
      raw: item,
    }));
  yahooResponseCache.set(cacheKey, { cachedAt: Date.now(), products });
  return products;
}

async function fetchYahooResponse(url: string, searchLabel: string): Promise<YahooResponse | undefined> {
  const totalAttempts = config.yahooMaxRetries + 1;

  for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
    try {
      await waitForYahooRequestSlot();
      const response = await fetch(url);
      const text = await response.text();
      const body = parseYahooResponse(text);
      const errorMessage = body?.error?.message ?? text;

      if (!response.ok || body?.error) {
        if (isYahooRateLimitError(response.status, errorMessage) && attempt < totalAttempts) {
          yahooBlockedUntil = Math.max(yahooBlockedUntil, Date.now() + config.yahooRateLimitRetryDelayMs);
          console.warn(
            `[yahoo] Rate limit response for ${searchLabel}. status=${response.status} retry=${attempt}/${config.yahooMaxRetries}. waiting ${config.yahooRateLimitRetryDelayMs}ms.`,
          );
          await delay(config.yahooRateLimitRetryDelayMs);
          continue;
        }
        console.warn(
          `[yahoo] API error for ${searchLabel}. status=${response.status} message=${formatYahooErrorMessage(
            errorMessage,
          )}`,
        );
        return undefined;
      }

      if (!body) {
        console.warn(`[yahoo] Invalid JSON response for ${searchLabel}: ${formatYahooErrorMessage(text)}`);
        return undefined;
      }

      return body;
    } catch (error) {
      console.warn(`[yahoo] Failed to search items for ${searchLabel}:`, error);
      return undefined;
    }
  }

  console.warn(`[yahoo] Skipped ${searchLabel} after ${config.yahooMaxRetries} retries.`);
  return undefined;
}

async function waitForYahooRequestSlot(): Promise<void> {
  const previous = yahooRequestQueue;
  let releaseQueue: () => void = () => {};
  yahooRequestQueue = new Promise((resolve) => {
    releaseQueue = resolve;
  });

  await previous;
  try {
    const elapsed = Date.now() - lastYahooRequestStartedAt;
    const waitMs = Math.max(YAHOO_REQUEST_INTERVAL_MS - elapsed, 0);
    if (waitMs > 0) {
      await delay(waitMs);
    }
    const blockedWaitMs = Math.max(yahooBlockedUntil - Date.now(), 0);
    if (blockedWaitMs > 0) {
      await delay(blockedWaitMs);
    }
    lastYahooRequestStartedAt = Date.now();
  } finally {
    releaseQueue();
  }
}

function parseYahooResponse(text: string): YahooResponse | undefined {
  try {
    return JSON.parse(text) as YahooResponse;
  } catch {
    return undefined;
  }
}

function isYahooRateLimitError(status: number, message: string): boolean {
  if (status === 429 || status === 403) return true;
  return /rate|limit|too many|quota|throttle|制限|上限|過多/i.test(message);
}

function formatYahooErrorMessage(message: string): string {
  return message.length > 500 ? `${message.slice(0, 500)}...` : message;
}

function describeYahooSearchParams(params: { query?: string; janCode?: string }): string {
  if (params.janCode) return `janCode=${params.janCode}`;
  if (params.query) return `keyword="${params.query}"`;
  return 'empty search';
}
