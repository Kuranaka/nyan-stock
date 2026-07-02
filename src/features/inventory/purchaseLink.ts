import * as WebBrowser from 'expo-web-browser';

import { InventoryItem } from './inventoryTypes';

export type ShopType = 'amazon' | 'rakuten' | 'yahoo' | 'other';

export function getPurchaseUrl(item: InventoryItem, shopType: ShopType): string | undefined {
  return item.purchaseLinks[shopType];
}

export function buildAffiliateUrl(originalUrl: string, shopType: ShopType): string {
  void shopType;
  // Future hooks: Amazon Associates, Rakuten Affiliate, Yahoo Shopping affiliate,
  // first-party click tracking, and URL parameter enrichment.
  return originalUrl;
}

export async function openPurchaseUrl(item: InventoryItem, shopType: ShopType) {
  const url = getPurchaseUrl(item, shopType);
  if (!url) return false;
  await WebBrowser.openBrowserAsync(buildAffiliateUrl(url, shopType));
  return true;
}
