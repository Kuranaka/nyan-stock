type PurchaseLinkSearchResult = {
  id: string;
  name: string;
  price?: number;
  shopName?: string;
  url: string;
  provider: 'rakuten' | 'yahoo';
};

type CurrentPriceResult = {
  name?: string;
  price?: number;
  shopName?: string;
  url: string;
  provider: 'rakuten' | 'yahoo';
};

type AffiliateUrlResult = {
  url: string;
  converted: boolean;
  provider: string;
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
  janCode?: string;
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
  const janCode = (url.searchParams.get('janCode') ?? url.searchParams.get('jan_code'))?.replace(/\D/g, '') ?? '';
  const purchaseUrl = url.searchParams.get('url')?.trim() ?? '';
  const provider = url.searchParams.get('provider') ?? 'all';
  const mode = url.searchParams.get('mode') ?? 'search';
  if (mode === 'affiliate') {
    if (!purchaseUrl) {
      return json({ error: 'missing_url', message: 'url is required.' }, 400);
    }
    const affiliateUrl = await buildAffiliateUrl(purchaseUrl, provider);
    return json(affiliateUrl);
  }
  if (purchaseUrl) {
    const price = await findCurrentPrice(purchaseUrl, provider);
    return json({ item: price });
  }
  if (!keyword && !janCode) {
    return json({ error: 'missing_keyword', message: 'keyword or janCode is required.' }, 400);
  }
  if (!['all', 'rakuten', 'yahoo'].includes(provider)) {
    return json({ error: 'invalid_provider', message: 'provider must be all, rakuten, or yahoo.' }, 400);
  }
  if (janCode && provider !== 'all' && provider !== 'yahoo') {
    return json({ error: 'invalid_provider', message: 'janCode search is supported for yahoo only.' }, 400);
  }

  if (janCode) {
    const yahoo = await searchYahooByJanCode(janCode);
    return json({
      items: yahoo.slice(0, 20),
    });
  }

  const [rakuten, yahoo] = await Promise.all([
    provider === 'all' || provider === 'rakuten' ? searchRakuten(keyword) : [],
    provider === 'all' || provider === 'yahoo' ? searchYahoo(keyword) : [],
  ]);
  return json({
    items: [...rakuten, ...yahoo].slice(0, 20),
  });
});

async function buildAffiliateUrl(purchaseUrl: string, provider: string): Promise<AffiliateUrlResult> {
  if (provider === 'rakuten' || (provider === 'all' && purchaseUrl.includes('rakuten.co.jp'))) {
    const affiliateUrl = buildRakutenAffiliateUrl(purchaseUrl);
    return {
      url: affiliateUrl ?? purchaseUrl,
      converted: Boolean(affiliateUrl && affiliateUrl !== purchaseUrl),
      provider: 'rakuten',
    };
  }

  if (provider === 'yahoo' || (provider === 'all' && purchaseUrl.includes('yahoo.co.jp'))) {
    const affiliateUrl = buildYahooAffiliateUrl(purchaseUrl);
    return {
      url: affiliateUrl ?? purchaseUrl,
      converted: Boolean(affiliateUrl && affiliateUrl !== purchaseUrl),
      provider: 'yahoo',
    };
  }

  if (provider === 'amazon' || (provider === 'all' && purchaseUrl.includes('amazon.'))) {
    const affiliateUrl = buildAmazonAffiliateUrl(purchaseUrl);
    return {
      url: affiliateUrl ?? purchaseUrl,
      converted: Boolean(affiliateUrl && affiliateUrl !== purchaseUrl),
      provider: 'amazon',
    };
  }

  // TODO: その他ECのアフィリエイト変換は、正式な提携ID・規約に合わせて追加する。
  // ここではアプリ側にAPIキーを持たせないため、未対応Providerは元URLを返す。
  return {
    url: purchaseUrl,
    converted: false,
    provider,
  };
}

async function findCurrentPrice(
  purchaseUrl: string,
  provider: string,
): Promise<CurrentPriceResult | undefined> {
  if (provider === 'rakuten' || (provider === 'all' && purchaseUrl.includes('rakuten.co.jp'))) {
    return findRakutenCurrentPrice(purchaseUrl);
  }
  if (provider === 'yahoo' || (provider === 'all' && purchaseUrl.includes('yahoo.co.jp'))) {
    return findYahooCurrentPrice(purchaseUrl);
  }
  return undefined;
}

async function searchRakuten(keyword: string): Promise<PurchaseLinkSearchResult[]> {
  const applicationId = Deno.env.get('RAKUTEN_APPLICATION_ID');
  const accessKey = Deno.env.get('RAKUTEN_ACCESS_KEY');
  const affiliateId = getRakutenAffiliateId();
  if (!applicationId || !accessKey) {
    console.warn('[purchase-link-search] Missing Rakuten secret(s): RAKUTEN_APPLICATION_ID, RAKUTEN_ACCESS_KEY');
    return [];
  }

  const params = new URLSearchParams({
    applicationId,
    accessKey,
    keyword,
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
  return searchYahooItems({ query: keyword });
}

async function searchYahooByJanCode(janCode: string): Promise<PurchaseLinkSearchResult[]> {
  return searchYahooItems({ janCode });
}

async function searchYahooItems(searchOptions: { query?: string; janCode?: string }): Promise<PurchaseLinkSearchResult[]> {
  const clientId = Deno.env.get('YAHOO_CLIENT_ID');
  if (!clientId) {
    console.warn('[purchase-link-search] Missing Yahoo secret: YAHOO_CLIENT_ID');
    return [];
  }

  const searchParams = new URLSearchParams({
    appid: clientId,
    results: '10',
  });
  if (searchOptions.query) searchParams.set('query', searchOptions.query);
  if (searchOptions.janCode) searchParams.set('jan_code', searchOptions.janCode);

  try {
    const response = await fetch(`${yahooEndpoint}?${searchParams.toString()}`);
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

function buildRakutenAffiliateUrl(purchaseUrl: string): string | undefined {
  const affiliateId = getRakutenAffiliateId();
  if (!affiliateId || isRakutenAffiliateUrl(purchaseUrl)) return undefined;

  try {
    const url = new URL(purchaseUrl);
    if (!url.hostname.includes('rakuten.co.jp')) return undefined;
    const encodedUrl = encodeURIComponent(url.toString());
    return `https://hb.afl.rakuten.co.jp/hgc/${encodeURIComponent(affiliateId)}/?pc=${encodedUrl}&m=${encodedUrl}`;
  } catch {
    return undefined;
  }
}

function buildYahooAffiliateUrl(purchaseUrl: string): string | undefined {
  const sid = Deno.env.get('YAHOO_VALUECOMMERCE_SID') ?? Deno.env.get('VALUECOMMERCE_SID');
  const pid = Deno.env.get('YAHOO_VALUECOMMERCE_PID') ?? Deno.env.get('VALUECOMMERCE_PID');
  if (!sid || !pid || isYahooAffiliateUrl(purchaseUrl)) return undefined;

  try {
    const url = new URL(purchaseUrl);
    if (!url.hostname.includes('yahoo.co.jp')) return undefined;
    return `https://ck.jp.ap.valuecommerce.com/servlet/referral?sid=${encodeURIComponent(
      sid,
    )}&pid=${encodeURIComponent(pid)}&vc_url=${encodeURIComponent(url.toString())}`;
  } catch {
    return undefined;
  }
}

function buildAmazonAffiliateUrl(purchaseUrl: string): string | undefined {
  const associateTag = Deno.env.get('AMAZON_ASSOCIATE_TAG') ?? Deno.env.get('AMAZON_AFFILIATE_TAG');
  if (!associateTag) return undefined;

  try {
    const url = new URL(purchaseUrl);
    if (!isAmazonHost(url.hostname) || url.searchParams.has('tag')) return undefined;
    url.searchParams.set('tag', associateTag);
    return url.toString();
  } catch {
    return undefined;
  }
}

async function findRakutenCurrentPrice(purchaseUrl: string): Promise<CurrentPriceResult | undefined> {
  const target = parseRakutenUrl(purchaseUrl);
  if (!target) return undefined;
  const items = await searchRakuten(target.itemPath);
  const matched =
    items.find((item) => item.id === `rakuten:${target.shopCode}:${target.itemPath}`) ??
    items.find((item) => normalizeUrl(item.url).includes(`/${target.shopCode}/${target.itemPath}`)) ??
    items[0];
  if (!matched) return undefined;
  return {
    name: matched.name,
    price: matched.price,
    shopName: matched.shopName,
    url: matched.url,
    provider: 'rakuten',
  };
}

async function findYahooCurrentPrice(purchaseUrl: string): Promise<CurrentPriceResult | undefined> {
  const target = parseYahooUrl(purchaseUrl);
  if (!target) return undefined;
  const items = await searchYahoo(target.itemCode);
  const matched =
    items.find((item) => item.id === `yahoo:${target.itemCode}`) ??
    items.find((item) => normalizeUrl(item.url).includes(target.itemCode)) ??
    items[0];
  if (!matched) return undefined;
  return {
    name: matched.name,
    price: matched.price,
    shopName: matched.shopName,
    url: matched.url,
    provider: 'yahoo',
  };
}

function parseRakutenUrl(value: string): { shopCode: string; itemPath: string } | undefined {
  try {
    const url = new URL(value);
    const parts = url.pathname.split('/').filter(Boolean);
    if (!url.hostname.includes('rakuten.co.jp') || parts.length < 2) return undefined;
    return {
      shopCode: parts[0],
      itemPath: parts[1],
    };
  } catch {
    return undefined;
  }
}

function getRakutenAffiliateId(): string | undefined {
  return Deno.env.get('RAKUTEN_AFFILIATE_ID') ?? Deno.env.get('RAKUTEN_ACCESS_KEY');
}

function isRakutenAffiliateUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.hostname === 'hb.afl.rakuten.co.jp' || url.searchParams.has('rafcid');
  } catch {
    return false;
  }
}

function isYahooAffiliateUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.hostname === 'ck.jp.ap.valuecommerce.com' || url.searchParams.has('vc_url');
  } catch {
    return false;
  }
}

function isAmazonHost(hostname: string): boolean {
  return /(^|\.)amazon\./.test(hostname);
}

function parseYahooUrl(value: string): { itemCode: string } | undefined {
  try {
    const url = new URL(value);
    const parts = url.pathname.split('/').filter(Boolean);
    const last = parts.at(-1)?.replace(/\.html$/, '');
    if (!url.hostname.includes('yahoo.co.jp') || !last) return undefined;
    return { itemCode: last };
  } catch {
    return undefined;
  }
}

function normalizeUrl(value: string): string {
  try {
    const url = new URL(value);
    return `${url.hostname}${url.pathname}`.replace(/\/+$/, '');
  } catch {
    return value;
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
