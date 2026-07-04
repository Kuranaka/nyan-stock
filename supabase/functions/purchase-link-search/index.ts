type PurchaseLinkSearchResult = {
  id: string;
  name: string;
  price?: number;
  shopName?: string;
  url: string;
  provider: 'rakuten' | 'yahoo';
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
  Items?: Array<RakutenItem | { Item?: RakutenItem }>;
  error?: string;
  error_description?: string;
};

type YahooItem = {
  code?: string;
  name?: string;
  price?: number;
  url?: string;
  seller?: {
    name?: string;
  };
};

type YahooResponse = {
  hits?: YahooItem[];
  error?: {
    message?: string;
  };
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const rakutenEndpoint = 'https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701';
const yahooEndpoint = 'https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  if (request.method !== 'GET') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  const url = new URL(request.url);
  const keyword = url.searchParams.get('keyword')?.trim() ?? '';
  if (!keyword) {
    return json({ error: 'missing_keyword', message: 'keyword is required.' }, 400);
  }

  const [rakuten, yahoo] = await Promise.all([searchRakuten(keyword), searchYahoo(keyword)]);
  return json({
    items: [...rakuten, ...yahoo].slice(0, 20),
  });
});

async function searchRakuten(keyword: string): Promise<PurchaseLinkSearchResult[]> {
  const applicationId = Deno.env.get('RAKUTEN_APPLICATION_ID');
  const accessKey = Deno.env.get('RAKUTEN_ACCESS_KEY');
  if (!applicationId || !accessKey) {
    console.warn('[purchase-link-search] Missing Rakuten secret(s): RAKUTEN_APPLICATION_ID, RAKUTEN_ACCESS_KEY');
    return [];
  }

  const params = new URLSearchParams({
    applicationId,
    keyword,
    format: 'json',
    formatVersion: '2',
    hits: '10',
    availability: '1',
    imageFlag: '1',
    elements: 'itemCode,itemName,itemPrice,itemUrl,affiliateUrl,shopName',
  });

  try {
    const response = await fetch(`${rakutenEndpoint}?${params.toString()}`, {
      headers: {
        accessKey,
      },
    });
    const body = (await response.json()) as RakutenResponse;
    if (!response.ok || body.error) {
      console.warn(`[purchase-link-search] Rakuten error: ${body.error_description ?? body.error ?? response.status}`);
      return [];
    }

    return normalizeRakutenItems(body)
      .filter((item) => Boolean(item.itemCode && item.itemName && (item.affiliateUrl || item.itemUrl)))
      .map((item) => ({
        id: `rakuten:${item.itemCode}`,
        name: item.itemName ?? '',
        price: item.itemPrice,
        shopName: item.shopName,
        url: item.affiliateUrl || item.itemUrl || '',
        provider: 'rakuten',
      }));
  } catch (error) {
    console.warn('[purchase-link-search] Rakuten request failed:', error);
    return [];
  }
}

async function searchYahoo(keyword: string): Promise<PurchaseLinkSearchResult[]> {
  const clientId = Deno.env.get('YAHOO_CLIENT_ID');
  if (!clientId) {
    console.warn('[purchase-link-search] Missing Yahoo secret: YAHOO_CLIENT_ID');
    return [];
  }

  const params = new URLSearchParams({
    appid: clientId,
    query: keyword,
    results: '10',
  });

  try {
    const response = await fetch(`${yahooEndpoint}?${params.toString()}`);
    const body = (await response.json()) as YahooResponse;
    if (!response.ok || body.error) {
      console.warn(`[purchase-link-search] Yahoo error: ${body.error?.message ?? response.status}`);
      return [];
    }

    return (body.hits ?? [])
      .filter((item) => Boolean(item.code && item.name && item.url))
      .map((item) => ({
        id: `yahoo:${item.code}`,
        name: item.name ?? '',
        price: item.price,
        shopName: item.seller?.name,
        url: item.url ?? '',
        provider: 'yahoo',
      }));
  } catch (error) {
    console.warn('[purchase-link-search] Yahoo request failed:', error);
    return [];
  }
}

function normalizeRakutenItems(body: RakutenResponse): RakutenItem[] {
  if (body.items) return body.items;
  return (body.Items ?? [])
    .map((entry) => ('Item' in entry ? entry.Item : entry))
    .filter((item): item is RakutenItem => Boolean(item));
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
    },
    status,
  });
}
