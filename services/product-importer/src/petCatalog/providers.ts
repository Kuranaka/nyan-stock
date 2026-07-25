import { config, delay, warnMissingEnv } from '../config.js';
import { normalizeJanCode } from '../normalizers/normalizeJanCode.js';
import { ProductSearchQuery, RetailerListingInput, RetailerSource } from './types.js';

const RAKUTEN_ITEM_ENDPOINT = 'https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701';
const RAKUTEN_PRODUCT_ENDPOINT = 'https://openapi.rakuten.co.jp/ichibaproduct/api/Product/Search/20250801';
const YAHOO_ITEM_ENDPOINT = 'https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch';

export type CatalogProviderName = RetailerSource;

export async function collectRetailerListings(
  query: ProductSearchQuery,
  selectedProviders: CatalogProviderName[] = ['rakuten_ichiba', 'rakuten_product_navi', 'yahoo_shopping'],
): Promise<RetailerListingInput[]> {
  const results: RetailerListingInput[] = [];
  for (const provider of selectedProviders) {
    if (provider === 'rakuten_ichiba') results.push(...(await collectRakutenItems(query)));
    if (provider === 'rakuten_product_navi') results.push(...(await collectRakutenProducts(query)));
    if (provider === 'yahoo_shopping') results.push(...(await collectYahooItems(query)));
  }
  return results;
}

export async function collectRakutenItems(query: ProductSearchQuery): Promise<RetailerListingInput[]> {
  if (!hasRakutenCredentials('rakuten_ichiba')) return [];
  const results: RetailerListingInput[] = [];
  for (let page = 1; page <= query.maxPages; page += 1) {
    const params = rakutenBaseParams(query, page);
    params.set(
      'elements',
      [
        'itemCode',
        'itemName',
        'itemCaption',
        'itemPrice',
        'itemUrl',
        'affiliateUrl',
        'mediumImageUrls',
        'smallImageUrls',
        'shopName',
        'genreId',
        'availability',
      ].join(','),
    );
    const body = await fetchRakuten(`${RAKUTEN_ITEM_ENDPOINT}?${params.toString()}`, 'rakuten_ichiba', query, page);
    if (!body) break;
    const items = unwrapArray<RakutenItem>(body, ['items', 'Items'], ['Item']);
    const fetchedAt = new Date().toISOString();
    results.push(
      ...items
        .filter((item) => Boolean(item.itemCode && item.itemName))
        .map((item) => ({
          source: 'rakuten_ichiba' as const,
          sourceItemId: item.itemCode ?? '',
          searchQueryId: query.id,
          searchPetGroup: query.petGroup,
          searchTargetSpecies: query.targetSpecies,
          contentLocale: query.locale,
          marketCode: query.marketCode,
          currencyCode: query.currencyCode,
          rawTitle: item.itemName ?? '',
          rawDescription: item.itemCaption,
          shopName: item.shopName,
          price: item.itemPrice,
          itemUrl: item.itemUrl,
          affiliateUrl: item.affiliateUrl,
          imageUrl: readRakutenImage(item.mediumImageUrls?.[0]) ?? readRakutenImage(item.smallImageUrls?.[0]),
          genreId: stringValue(item.genreId),
          availability: booleanAvailability(item.availability),
          fetchedAt,
          rawJson: item,
        })),
    );
    if (items.length === 0 || page >= numberValue(body.pageCount, query.maxPages)) break;
  }
  return results;
}

export async function collectRakutenProducts(query: ProductSearchQuery): Promise<RetailerListingInput[]> {
  if (!hasRakutenCredentials('rakuten_product_navi')) return [];
  const results: RetailerListingInput[] = [];
  for (let page = 1; page <= query.maxPages; page += 1) {
    const params = rakutenBaseParams(query, page);
    params.set(
      'elements',
      [
        'productId',
        'productCode',
        'productName',
        'productNo',
        'brandName',
        'productUrlPC',
        'searchUrl',
        'affiliateUrl',
        'mediumImageUrl',
        'smallImageUrl',
        'productCaption',
        'makerName',
        'salesItemCount',
        'salesMinPrice',
        'genreId',
        'genreName',
      ].join(','),
    );
    const body = await fetchRakuten(`${RAKUTEN_PRODUCT_ENDPOINT}?${params.toString()}`, 'rakuten_product_navi', query, page);
    if (!body) break;
    const products = unwrapArray<RakutenProduct>(body, ['products', 'Products', 'items', 'Items'], ['Product', 'Item']);
    const fetchedAt = new Date().toISOString();
    results.push(
      ...products
        .filter((item) => Boolean(item.productId && item.productName))
        .map((item) => ({
          source: 'rakuten_product_navi' as const,
          sourceItemId: item.productId ?? '',
          searchQueryId: query.id,
          searchPetGroup: query.petGroup,
          searchTargetSpecies: query.targetSpecies,
          contentLocale: query.locale,
          marketCode: query.marketCode,
          currencyCode: query.currencyCode,
          rawTitle: item.productName ?? '',
          rawDescription: item.productCaption,
          brandName: item.brandName,
          makerName: item.makerName,
          price: numberOrUndefined(item.salesMinPrice),
          itemUrl: item.productUrlPC ?? item.searchUrl,
          affiliateUrl: item.affiliateUrl,
          imageUrl: item.mediumImageUrl ?? item.smallImageUrl,
          janCode: normalizeJanCode(item.productCode),
          modelNumber: item.productNo,
          genreId: stringValue(item.genreId),
          genreName: item.genreName,
          availability: numberOrUndefined(item.salesItemCount) !== undefined ? Number(item.salesItemCount) > 0 : undefined,
          fetchedAt,
          rawJson: item,
        })),
    );
    if (products.length === 0 || page >= numberValue(body.pageCount, query.maxPages)) break;
  }
  return results;
}

export async function collectYahooItems(query: ProductSearchQuery): Promise<RetailerListingInput[]> {
  if (!config.yahooClientId) {
    warnMissingEnv('yahoo_shopping', ['YAHOO_CLIENT_ID']);
    return [];
  }
  const results: RetailerListingInput[] = [];
  const pageSize = 30;
  for (let page = 1; page <= query.maxPages; page += 1) {
    const params = new URLSearchParams({
      appid: config.yahooClientId,
      query: query.keyword,
      results: String(pageSize),
      start: String((page - 1) * pageSize + 1),
      in_stock: 'true',
      condition: 'new',
      image_size: '300',
    });
    if (query.yahooGenreCategoryId) params.set('genre_category_id', query.yahooGenreCategoryId);
    if (query.yahooBrandId) params.set('brand_id', query.yahooBrandId);

    await delay(config.yahooRequestIntervalMs);
    const body = await fetchJson(`${YAHOO_ITEM_ENDPOINT}?${params.toString()}`, {}, 'yahoo_shopping', query, page);
    if (!body) break;
    const items = Array.isArray(body.hits) ? (body.hits as YahooItem[]) : [];
    const fetchedAt = new Date().toISOString();
    results.push(
      ...items
        .filter((item) => Boolean(item.code && item.name))
        .map((item) => ({
          source: 'yahoo_shopping' as const,
          sourceItemId: item.code ?? '',
          searchQueryId: query.id,
          searchPetGroup: query.petGroup,
          searchTargetSpecies: query.targetSpecies,
          contentLocale: query.locale,
          marketCode: query.marketCode,
          currencyCode: query.currencyCode,
          rawTitle: item.name ?? '',
          rawDescription: [item.headLine, item.description].filter(Boolean).join('\n') || undefined,
          shopName: item.seller?.name,
          brandName: item.brand?.name,
          price: item.price,
          itemUrl: item.url,
          imageUrl: item.exImage?.url ?? item.image?.medium ?? item.image?.small,
          janCode: normalizeJanCode(item.janCode),
          genreId: stringValue(item.genreCategory?.id),
          genreName: item.genreCategory?.name,
          availability: item.inStock,
          fetchedAt,
          rawJson: item,
        })),
    );
    const total = numberValue(body.totalResultsAvailable, 0);
    if (items.length === 0 || page * pageSize >= Math.min(total, 1000)) break;
  }
  return results;
}

function rakutenBaseParams(query: ProductSearchQuery, page: number): URLSearchParams {
  const params = new URLSearchParams({
    applicationId: config.rakutenApplicationId ?? '',
    keyword: query.keyword,
    format: 'json',
    formatVersion: '2',
    hits: '30',
    page: String(page),
  });
  if (config.rakutenAffiliateId) params.set('affiliateId', config.rakutenAffiliateId);
  if (query.rakutenGenreId) params.set('genreId', query.rakutenGenreId);
  return params;
}

async function fetchRakuten(
  url: string,
  source: RetailerSource,
  query: ProductSearchQuery,
  page: number,
): Promise<Record<string, unknown> | undefined> {
  await delay();
  return fetchJson(url, { accessKey: config.rakutenAccessKey ?? '' }, source, query, page);
}

async function fetchJson(
  url: string,
  headers: Record<string, string>,
  source: RetailerSource,
  query: ProductSearchQuery,
  page: number,
): Promise<Record<string, unknown> | undefined> {
  try {
    const response = await fetch(url, { headers });
    const text = await response.text();
    if (!response.ok) {
      console.warn(`[pet-catalog:${source}] API error status=${response.status} query=${query.id} page=${page}: ${text.slice(0, 500)}`);
      return undefined;
    }
    const body = JSON.parse(text) as Record<string, unknown>;
    if (body.error) {
      console.warn(`[pet-catalog:${source}] API error query=${query.id} page=${page}: ${String(body.error_description ?? body.error)}`);
      return undefined;
    }
    return body;
  } catch (error) {
    console.warn(`[pet-catalog:${source}] Request failed query=${query.id} page=${page}:`, error);
    return undefined;
  }
}

function hasRakutenCredentials(scope: string): boolean {
  const missing = [
    !config.rakutenApplicationId ? 'RAKUTEN_APPLICATION_ID' : undefined,
    !config.rakutenAccessKey ? 'RAKUTEN_ACCESS_KEY' : undefined,
  ].filter((value): value is string => Boolean(value));
  warnMissingEnv(scope, missing);
  return missing.length === 0;
}

function unwrapArray<T>(
  body: Record<string, unknown>,
  collectionKeys: string[],
  wrapperKeys: string[],
): T[] {
  const collection = collectionKeys.map((key) => body[key]).find(Array.isArray) as unknown[] | undefined;
  if (!collection) return [];
  return collection
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return undefined;
      const record = entry as Record<string, unknown>;
      const wrapped = wrapperKeys.map((key) => record[key]).find((value) => value && typeof value === 'object');
      return (wrapped ?? entry) as T;
    })
    .filter((item): item is T => Boolean(item));
}

function readRakutenImage(value: string | { imageUrl?: string } | undefined): string | undefined {
  if (!value) return undefined;
  return typeof value === 'string' ? value : value.imageUrl;
}

function booleanAvailability(value: number | string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  return String(value) === '1';
}

function numberValue(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function numberOrUndefined(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return undefined;
}

type RakutenItem = {
  itemCode?: string;
  itemName?: string;
  itemCaption?: string;
  itemPrice?: number;
  itemUrl?: string;
  affiliateUrl?: string;
  mediumImageUrls?: Array<string | { imageUrl?: string }>;
  smallImageUrls?: Array<string | { imageUrl?: string }>;
  shopName?: string;
  genreId?: string | number;
  availability?: string | number;
};

type RakutenProduct = {
  productId?: string;
  productCode?: string;
  productName?: string;
  productNo?: string;
  brandName?: string;
  productUrlPC?: string;
  searchUrl?: string;
  affiliateUrl?: string;
  mediumImageUrl?: string;
  smallImageUrl?: string;
  productCaption?: string;
  makerName?: string;
  salesItemCount?: number | string;
  salesMinPrice?: number | string;
  genreId?: string | number;
  genreName?: string;
};

type YahooItem = {
  code?: string;
  name?: string;
  description?: string;
  headLine?: string;
  inStock?: boolean;
  price?: number;
  url?: string;
  janCode?: string;
  image?: { medium?: string; small?: string };
  exImage?: { url?: string };
  seller?: { name?: string };
  brand?: { id?: string | number; name?: string };
  genreCategory?: { id?: string | number; name?: string };
};
