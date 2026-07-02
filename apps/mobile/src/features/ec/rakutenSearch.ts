import { AppSettings } from '@/features/settings/settingsTypes';

const RAKUTEN_ITEM_SEARCH_ENDPOINT =
  'https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701';

export type RakutenSearchResult = {
  id: string;
  name: string;
  price?: number;
  shopName?: string;
  url: string;
};

type RakutenItem = {
  itemCode?: string;
  itemName?: string;
  itemPrice?: number;
  itemUrl?: string;
  affiliateUrl?: string;
  shopName?: string;
};

type RakutenResponse = {
  items?: RakutenItem[];
  error?: string;
  error_description?: string;
};

export function hasRakutenApiSettings(settings: AppSettings): boolean {
  return Boolean(settings.rakutenApplicationId?.trim() && settings.rakutenAccessKey?.trim());
}

export async function searchRakutenItems(
  keyword: string,
  settings: AppSettings,
): Promise<RakutenSearchResult[]> {
  const query = keyword.trim();
  const applicationId = settings.rakutenApplicationId?.trim();
  const accessKey = settings.rakutenAccessKey?.trim();
  const affiliateId = settings.rakutenAffiliateId?.trim();

  if (!query) {
    throw new Error('検索キーワードを入力してください。');
  }
  if (!applicationId || !accessKey) {
    throw new Error('設定画面で楽天APIのApplication IDとAccess Keyを保存してください。');
  }

  const params = new URLSearchParams({
    applicationId,
    keyword: query,
    format: 'json',
    formatVersion: '2',
    hits: '10',
    availability: '1',
    imageFlag: '1',
    elements: 'itemCode,itemName,itemPrice,itemUrl,affiliateUrl,shopName',
  });
  if (affiliateId) {
    params.set('affiliateId', affiliateId);
  }

  const response = await fetch(`${RAKUTEN_ITEM_SEARCH_ENDPOINT}?${params.toString()}`, {
    headers: {
      accessKey,
    },
  });
  const body = (await response.json()) as RakutenResponse;
  if (!response.ok || body.error) {
    throw new Error(body.error_description || body.error || '楽天市場の商品検索に失敗しました。');
  }

  return (body.items ?? []).reduce<RakutenSearchResult[]>((results, item, index) => {
    const url = item.affiliateUrl || item.itemUrl;
    if (!item.itemName || !url) return results;
    results.push({
        id: item.itemCode || `${item.itemName}-${index}`,
        name: item.itemName,
        price: item.itemPrice,
        shopName: item.shopName,
        url,
    });
    return results;
  }, []);
}
