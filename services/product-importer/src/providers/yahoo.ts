import { config, delay } from '../config.js';
import { RawProduct } from '../types.js';

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
};

export async function searchYahooItemsByKeyword(keyword: string): Promise<RawProduct[]> {
  return searchYahooItems({ query: keyword });
}

export async function searchYahooItemsByJanCode(janCode: string): Promise<RawProduct[]> {
  return searchYahooItems({ janCode });
}

async function searchYahooItems(params: { query?: string; janCode?: string }): Promise<RawProduct[]> {
  if (!config.yahooClientId) {
    console.warn('[yahoo] YAHOO_CLIENT_ID is not set. Skipping Yahoo import.');
    return [];
  }

  const searchParams = new URLSearchParams({
    appid: config.yahooClientId,
    results: '30',
  });
  if (params.query) searchParams.set('query', params.query);
  if (params.janCode) searchParams.set('jan_code', params.janCode);

  const url = `https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch?${searchParams.toString()}`;

  try {
    await delay();
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`[yahoo] API error ${response.status}: ${await response.text()}`);
      return [];
    }
    const body = (await response.json()) as YahooResponse;
    const fetchedAt = new Date().toISOString();
    return (body.hits ?? [])
      .filter((item) => Boolean(item.code && item.name))
      .map((item) => ({
        provider: 'yahoo',
        externalId: item.code ?? '',
        rawName: item.name ?? '',
        brand: item.brand?.name,
        categoryText: item.genreCategory?.name,
        price: item.price,
        imageUrl: item.image?.medium ?? item.image?.small,
        url: item.url,
        janCode: item.janCode,
        shopName: item.seller?.name,
        fetchedAt,
        raw: item,
      }));
  } catch (error) {
    console.warn('[yahoo] Failed to search items:', error);
    return [];
  }
}
