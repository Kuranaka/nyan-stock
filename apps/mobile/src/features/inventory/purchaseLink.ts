import * as WebBrowser from 'expo-web-browser';

import { InventoryItem } from './inventoryTypes';

export type ShopType = 'amazon' | 'rakuten' | 'yahoo' | 'other';

export type CurrentPurchasePrice = {
  name?: string;
  price?: number;
  shopName?: string;
  url: string;
  provider: 'rakuten' | 'yahoo';
};

export type PurchasePriceComparison = Partial<Record<'rakuten' | 'yahoo', CurrentPurchasePrice>>;

type CurrentPurchasePriceResponse = {
  item?: CurrentPurchasePrice;
  error?: string;
  message?: string;
};

type AffiliateUrlResponse = {
  url?: string;
  converted?: boolean;
  error?: string;
  message?: string;
};

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const purchaseLinkSearchFunctionUrl = process.env.EXPO_PUBLIC_PURCHASE_LINK_SEARCH_FUNCTION_URL;
const currentPriceCacheTtlMs = 60 * 60 * 1000;
const currentPriceCache = new Map<string, { checkedAt: number; item?: CurrentPurchasePrice }>();

export function getPurchaseUrl(item: InventoryItem, shopType: ShopType): string | undefined {
  return item.purchaseLinks[shopType] ?? buildPurchaseSearchUrl(item.name, shopType);
}

export function hasSavedPurchaseUrl(item: InventoryItem, shopType: ShopType): boolean {
  return Boolean(item.purchaseLinks[shopType]);
}

export function buildPurchaseSearchUrl(productName: string, shopType: ShopType): string | undefined {
  const keyword = productName.trim();
  if (!keyword || shopType === 'other') return undefined;

  if (shopType === 'amazon') {
    const params = new URLSearchParams({
      k: keyword,
      i: 'pets',
    });
    return `https://www.amazon.co.jp/s?${params.toString()}`;
  }

  if (shopType === 'rakuten') {
    return `https://search.rakuten.co.jp/search/mall/${encodeURIComponent(keyword)}/`;
  }

  const params = new URLSearchParams({
    p: keyword,
  });
  return `https://shopping.yahoo.co.jp/search?${params.toString()}`;
}

export async function buildAffiliateUrl(originalUrl: string, shopType: ShopType): Promise<string> {
  const endpoint = getPurchaseLinkSearchEndpoint();
  if (!endpoint || !supabaseAnonKey) return originalUrl;

  try {
    const response = await fetch(
      `${endpoint}?mode=affiliate&url=${encodeURIComponent(originalUrl)}&provider=${shopType}`,
      {
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
      },
    );
    const body = (await response.json()) as AffiliateUrlResponse;
    if (!response.ok || body.error || !body.url) return originalUrl;
    return body.url;
  } catch {
    return originalUrl;
  }
}

export async function openPurchaseUrl(item: InventoryItem, shopType: ShopType) {
  const url = getPurchaseUrl(item, shopType);
  if (!url) return false;
  await WebBrowser.openBrowserAsync(await buildAffiliateUrl(url, shopType));
  return true;
}

export async function getCurrentPurchasePrice(
  item: InventoryItem,
  shopType: ShopType,
): Promise<CurrentPurchasePrice | undefined> {
  if (shopType !== 'rakuten' && shopType !== 'yahoo') return undefined;
  const url = item.purchaseLinks[shopType];
  const endpoint = getPurchaseLinkSearchEndpoint();
  if (!url || !endpoint || !supabaseAnonKey) return undefined;

  const cacheKey = `${shopType}:${url}`;
  const cached = currentPriceCache.get(cacheKey);
  if (cached && Date.now() - cached.checkedAt < currentPriceCacheTtlMs) {
    return cached.item;
  }

  try {
    const response = await fetch(`${endpoint}?url=${encodeURIComponent(url)}&provider=${shopType}`, {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
    });
    const body = (await response.json()) as CurrentPurchasePriceResponse;
    if (!response.ok || body.error) {
      currentPriceCache.set(cacheKey, { checkedAt: Date.now() });
      return undefined;
    }
    currentPriceCache.set(cacheKey, { checkedAt: Date.now(), item: body.item });
    return body.item;
  } catch {
    currentPriceCache.set(cacheKey, { checkedAt: Date.now() });
    return undefined;
  }
}

export async function getPurchasePriceComparison(item: InventoryItem): Promise<PurchasePriceComparison> {
  const [rakuten, yahoo] = await Promise.all([
    getCurrentPurchasePrice(item, 'rakuten'),
    getCurrentPurchasePrice(item, 'yahoo'),
  ]);
  return {
    rakuten,
    yahoo,
  };
}

function getPurchaseLinkSearchEndpoint(): string | undefined {
  if (purchaseLinkSearchFunctionUrl) return purchaseLinkSearchFunctionUrl.replace(/\/+$/, '');
  if (!supabaseUrl) return undefined;
  return `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/purchase-link-search`;
}
