const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const purchaseLinkSearchFunctionUrl = process.env.EXPO_PUBLIC_PURCHASE_LINK_SEARCH_FUNCTION_URL;

export type RakutenSearchResult = {
  id: string;
  name: string;
  price?: number;
  shopName?: string;
  url: string;
};

type PurchaseLinkSearchApiResponse = {
  items?: {
    id?: string;
    name?: string;
    price?: number;
    shopName?: string;
    url?: string;
  }[];
  error?: string;
  message?: string;
};

export function hasPurchaseLinkSearchApi(): boolean {
  return Boolean(getPurchaseLinkSearchEndpoint() && supabaseAnonKey);
}

export async function searchRakutenItems(keyword: string): Promise<RakutenSearchResult[]> {
  const query = keyword.trim();

  if (!query) {
    throw new Error('検索キーワードを入力してください。');
  }

  if (hasPurchaseLinkSearchApi()) {
    return searchPurchaseLinksFromEdgeFunction(query);
  }

  throw new Error('Supabase Edge FunctionのURLとAnon Keyを設定してください。');
}

async function searchPurchaseLinksFromEdgeFunction(keyword: string): Promise<RakutenSearchResult[]> {
  const baseUrl = getPurchaseLinkSearchEndpoint();
  if (!baseUrl || !supabaseAnonKey) return [];
  const endpoint = `${baseUrl}?keyword=${encodeURIComponent(keyword)}`;
  const response = await fetch(endpoint, {
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
  });
  const body = (await response.json()) as PurchaseLinkSearchApiResponse;
  if (!response.ok || body.error) {
    throw new Error(body.message || body.error || '購入リンク検索に失敗しました。');
  }

  return (body.items ?? []).reduce<RakutenSearchResult[]>((results, item, index) => {
    if (!item.name || !item.url) return results;
    results.push({
      id: item.id || `${item.name}-${index}`,
      name: item.name,
      price: item.price,
      shopName: item.shopName,
      url: item.url,
    });
    return results;
  }, []);
}

function getPurchaseLinkSearchEndpoint(): string | undefined {
  if (purchaseLinkSearchFunctionUrl) return purchaseLinkSearchFunctionUrl.replace(/\/+$/, '');
  if (!supabaseUrl) return undefined;
  return `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/purchase-link-search`;
}
