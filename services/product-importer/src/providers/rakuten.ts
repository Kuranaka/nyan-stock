import { config, delay, warnMissingEnv } from '../config.js';
import { RawProduct } from '../types.js';

type RakutenItem = {
  itemCode?: string;
  itemName?: string;
  itemPrice?: number;
  itemUrl?: string;
  mediumImageUrls?: Array<{ imageUrl?: string }>;
  smallImageUrls?: Array<{ imageUrl?: string }>;
  shopName?: string;
  genreId?: string;
};

type RakutenResponse = {
  Items?: Array<{ Item?: RakutenItem }>;
};

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
    hits: '30',
    sort: 'standard',
  });
  const headers = buildRakutenAuthHeaders();
  const url = `https://app.rakuten.co.jp/services/api/IchibaItem/Search/20220601?${params.toString()}`;

  try {
    await delay();
    const response = await fetch(url, { headers });
    if (!response.ok) {
      console.warn(`[rakuten] API error ${response.status}: ${await response.text()}`);
      return [];
    }
    const body = (await response.json()) as RakutenResponse;
    const fetchedAt = new Date().toISOString();
    return (body.Items ?? [])
      .map((entry) => entry.Item)
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
  return item.mediumImageUrls?.[0]?.imageUrl ?? item.smallImageUrls?.[0]?.imageUrl;
}

function buildRakutenAuthHeaders(): Record<string, string> {
  if (!config.rakutenAccessKey) return {};
  return {
    accessKey: config.rakutenAccessKey,
  };
}
