import { config, delay, warnMissingEnv } from '../config.js';
import { RawProduct } from '../types.js';

type RakutenItem = {
  itemCode?: string;
  itemName?: string;
  itemPrice?: number;
  itemUrl?: string;
  mediumImageUrls?: Array<string | { imageUrl?: string }>;
  smallImageUrls?: Array<string | { imageUrl?: string }>;
  shopName?: string;
  genreId?: string;
};

type RakutenResponse = {
  count?: number;
  items?: RakutenItem[];
  Items?: Array<RakutenItem | { Item?: RakutenItem }>;
  error?: string;
  error_description?: string;
};

const RAKUTEN_ITEM_SEARCH_ENDPOINT =
  'https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701';

export async function searchRakutenItemsByKeyword(keyword: string): Promise<RawProduct[]> {
  const missing = [
    !config.rakutenApplicationId ? 'RAKUTEN_APPLICATION_ID' : undefined,
    !config.rakutenAccessKey ? 'RAKUTEN_ACCESS_KEY' : undefined,
  ].filter((name): name is string => Boolean(name));

  warnMissingEnv('rakuten', missing);
  if (missing.length > 0) {
    console.warn('[rakuten] Skipping Rakuten import because Rakuten credentials are incomplete.');
    return [];
  }

  const applicationId = config.rakutenApplicationId ?? '';
  const params = new URLSearchParams({
    applicationId,
    keyword,
    format: 'json',
    formatVersion: '2',
    hits: '30',
    sort: 'standard',
    elements: 'itemCode,itemName,itemPrice,itemUrl,mediumImageUrls,smallImageUrls,shopName,genreId',
  });
  const headers = buildRakutenAuthHeaders();
  const url = `${RAKUTEN_ITEM_SEARCH_ENDPOINT}?${params.toString()}`;

  try {
    await delay();
    const response = await fetch(url, { headers });
    if (!response.ok) {
      console.warn(`[rakuten] API error ${response.status}: ${await response.text()}`);
      return [];
    }
    const body = (await response.json()) as RakutenResponse;
    if (body.error) {
      console.warn(`[rakuten] API error: ${body.error_description ?? body.error}`);
      return [];
    }
    const fetchedAt = new Date().toISOString();
    const items = normalizeRakutenItems(body);
    if (items.length === 0) {
      console.warn(`[rakuten] 0 items for keyword "${keyword}". response keys: ${Object.keys(body).join(', ')}`);
    }
    return items
      .filter((item): item is RakutenItem => Boolean(item?.itemCode && item.itemName))
      .map((item) => ({
        provider: 'rakuten',
        externalId: item.itemCode ?? '',
        rawName: item.itemName ?? '',
        categoryText: item.genreId,
        price: item.itemPrice,
        imageUrl: pickRakutenImage(item),
        url: item.itemUrl,
        shopName: item.shopName,
        fetchedAt,
        raw: item,
      }));
  } catch (error) {
    console.warn('[rakuten] Failed to search items:', error);
    return [];
  }
}

function pickRakutenImage(item: RakutenItem): string | undefined {
  return readRakutenImage(item.mediumImageUrls?.[0]) ?? readRakutenImage(item.smallImageUrls?.[0]);
}

function readRakutenImage(image: string | { imageUrl?: string } | undefined): string | undefined {
  if (!image) return undefined;
  return typeof image === 'string' ? image : image.imageUrl;
}

function normalizeRakutenItems(body: RakutenResponse): RakutenItem[] {
  if (body.items) return body.items;
  return (body.Items ?? [])
    .map((entry) => ('Item' in entry ? entry.Item : entry))
    .filter((item): item is RakutenItem => Boolean(item));
}

function buildRakutenAuthHeaders(): Record<string, string> {
  if (!config.rakutenAccessKey) return {};
  return {
    accessKey: config.rakutenAccessKey,
  };
}
