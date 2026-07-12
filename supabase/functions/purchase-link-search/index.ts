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

type ProductMaster = {
  id: string;
  name: string;
  [key: string]: unknown;
};

type CacheEntry<T> = {
  result: {
    value: T | null;
  };
  expires_at: string;
};

type CacheLookup<T> = {
  hit: boolean;
  value?: T;
};

type AuthUser = {
  id: string;
};

type RateLimitResult = {
  allowed: boolean;
  retry_after_seconds: number;
  limit_kind: 'minute' | 'day' | null;
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
  totalResultsAvailable?: number;
  totalResultsReturned?: number;
  request?: {
    query?: string;
    janCode?: string;
  };
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
const cacheTableName = Deno.env.get('SUPABASE_EDGE_CACHE_TABLE') ?? 'edge_function_cache';
const productMasterTableName = Deno.env.get('SUPABASE_PRODUCT_MASTER_TABLE') ?? 'product_masters';
const searchResultCacheTtlSeconds = 6 * 60 * 60;
const priceCacheTtlSeconds = 3 * 60 * 60;
const affiliateCacheTtlSeconds = 7 * 24 * 60 * 60;
const productMasterSearchCacheTtlSeconds = 24 * 60 * 60;

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  if (request.method !== 'GET') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.replace(/\/+$/, '');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const accessToken = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !accessToken) {
    return json({ error: 'authentication_required', message: 'ログインが必要です。' }, 401);
  }

  let user: AuthUser;
  try {
    user = await getAuthenticatedUser(supabaseUrl, anonKey, accessToken);
  } catch {
    return json({ error: 'authentication_required', message: 'ログインを確認できませんでした。' }, 401);
  }
  const url = new URL(request.url);
  const keyword = url.searchParams.get('keyword')?.trim() ?? '';
  const janCode = (url.searchParams.get('janCode') ?? url.searchParams.get('jan_code'))?.replace(/\D/g, '') ?? '';
  const purchaseUrl = url.searchParams.get('url')?.trim() ?? '';
  const provider = url.searchParams.get('provider') ?? 'all';
  const mode = url.searchParams.get('mode') ?? 'search';
  const endpoint = purchaseUrl ? '/products/lookup' : '/affiliate/search';
  const rateLimit = await consumeRateLimit(supabaseUrl, serviceRoleKey, user.id, endpoint);
  if (!rateLimit.allowed) {
    // Opening a saved purchase URL should continue to work even after the
    // affiliate quota is exhausted. Do not call an upstream API or attach an
    // affiliate identifier in this case.
    if (mode === 'affiliate' && purchaseUrl) {
      return json({ url: purchaseUrl, converted: false, provider });
    }
    return json(
      {
        error: 'rate_limit_exceeded',
        message: '検索回数の上限に達しました。しばらく待ってからもう一度お試しください。',
        retryAfterSeconds: rateLimit.retry_after_seconds,
        limitKind: rateLimit.limit_kind,
      },
      429,
      { 'Retry-After': String(rateLimit.retry_after_seconds) },
    );
  }
  if (mode === 'product_master_search') {
    const products = await withCache(
      cacheKey('product_master_search', productMasterTableName),
      productMasterSearchCacheTtlSeconds,
      () => loadProductMasters(),
      'product_master_search',
    );
    return json({ items: products });
  }

  if (mode === 'affiliate') {
    if (!purchaseUrl) {
      return json({ error: 'missing_url', message: 'url is required.' }, 400);
    }
    const affiliateUrl = await withCache(
      cacheKey('affiliate', provider, purchaseUrl),
      affiliateCacheTtlSeconds,
      () => buildAffiliateUrl(purchaseUrl, provider),
      'affiliate',
    );
    return json(affiliateUrl);
  }
  if (purchaseUrl) {
    const price = await withCache(
      cacheKey('price', provider, purchaseUrl),
      priceCacheTtlSeconds,
      () => findCurrentPrice(purchaseUrl, provider),
      'price',
    );
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
    const yahoo = await withCache(
      cacheKey('product_search', 'jan', provider, janCode),
      searchResultCacheTtlSeconds,
      () => searchYahooByJanCode(janCode),
      'product_search',
    );
    return json({
      items: yahoo.slice(0, 20),
    });
  }

  const items = await withCache(
    cacheKey('product_search', 'keyword', provider, keyword),
    searchResultCacheTtlSeconds,
    async () => {
      const [rakuten, yahoo] = await Promise.all([
        provider === 'all' || provider === 'rakuten' ? searchRakuten(keyword) : [],
        provider === 'all' || provider === 'yahoo' ? searchYahoo(keyword) : [],
      ]);
      return [...rakuten, ...yahoo].slice(0, 20);
    },
    'product_search',
  );
  return json({ items });
});

async function getAuthenticatedUser(url: string, anonKey: string, accessToken: string): Promise<AuthUser> {
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(`user lookup failed: ${response.status}`);
  return (await response.json()) as AuthUser;
}

async function consumeRateLimit(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
  endpoint: '/affiliate/search' | '/products/lookup',
): Promise<RateLimitResult> {
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/consume_api_rate_limit`, {
      method: 'POST',
      headers: supabaseHeaders(serviceRoleKey),
      body: JSON.stringify({
        target_user_id: userId,
        target_endpoint: endpoint,
        minute_limit: 20,
        day_limit: 500,
      }),
    });
    if (!response.ok) throw new Error(`rate limit lookup failed: ${response.status}`);
    const rows = (await response.json()) as RateLimitResult[];
    const result = rows[0];
    if (!result) throw new Error('rate limit response was empty');
    return result;
  } catch (error) {
    // Failing open would allow an outage to turn into unbounded upstream usage.
    console.error('[purchase-link-search] rate limit check failed:', error);
    return { allowed: false, retry_after_seconds: 60, limit_kind: 'minute' };
  }
}

async function withCache<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
  cacheType: string,
): Promise<T> {
  const cached = await readCache<T>(key);
  if (cached.hit) return cached.value as T;

  const result = await loader();
  await writeCache(key, cacheType, result, ttlSeconds);
  return result;
}

async function readCache<T>(key: string): Promise<CacheLookup<T>> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.replace(/\/+$/, '');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) return { hit: false };

  try {
    const endpoint = `${supabaseUrl}/rest/v1/${encodeURIComponent(
      cacheTableName,
    )}?cache_key=eq.${encodeURIComponent(key)}&select=result,expires_at&limit=1`;
    const response = await fetch(endpoint, {
      headers: supabaseHeaders(serviceRoleKey),
    });
    if (!response.ok) {
      console.warn(`[purchase-link-search] cache read failed ${response.status}: ${await response.text()}`);
      return { hit: false };
    }
    const rows = (await response.json()) as Array<CacheEntry<T>>;
    const row = rows[0];
    if (!row || Date.parse(row.expires_at) <= Date.now()) return { hit: false };
    return {
      hit: true,
      value: row.result.value ?? undefined,
    };
  } catch (error) {
    console.warn('[purchase-link-search] cache read failed:', error);
    return { hit: false };
  }
}

async function writeCache<T>(key: string, cacheType: string, result: T, ttlSeconds: number): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.replace(/\/+$/, '');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) return;

  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/${encodeURIComponent(cacheTableName)}?on_conflict=cache_key`,
      {
        method: 'POST',
        headers: {
          ...supabaseHeaders(serviceRoleKey),
          Prefer: 'resolution=merge-duplicates',
        },
        body: JSON.stringify({
          cache_key: key,
          cache_type: cacheType,
          result: {
            value: result ?? null,
          },
          expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        }),
      },
    );
    if (!response.ok) {
      console.warn(`[purchase-link-search] cache write failed ${response.status}: ${await response.text()}`);
    }
  } catch (error) {
    console.warn('[purchase-link-search] cache write failed:', error);
  }
}

function supabaseHeaders(serviceRoleKey: string): Record<string, string> {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
  };
}

function cacheKey(...parts: string[]): string {
  return parts.map((part) => encodeURIComponent(part.trim().normalize('NFKC').toLowerCase())).join(':');
}

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

async function loadProductMasters(): Promise<ProductMaster[]> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.replace(/\/+$/, '');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    console.warn('[purchase-link-search] Missing Supabase secret(s): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
    return [];
  }

  try {
    const endpoint = `${supabaseUrl}/rest/v1/${encodeURIComponent(
      productMasterTableName,
    )}?select=data&limit=1000&order=id.asc`;
    const response = await fetch(endpoint, {
      headers: supabaseHeaders(serviceRoleKey),
    });
    if (!response.ok) {
      console.warn(`[purchase-link-search] ProductMaster load failed ${response.status}: ${await response.text()}`);
      return [];
    }
    const rows = (await response.json()) as Array<{ data?: ProductMaster }>;
    return rows
      .map((row) => row.data)
      .filter((product): product is ProductMaster => Boolean(product?.id && product.name));
  } catch (error) {
    console.warn('[purchase-link-search] ProductMaster load failed:', error);
    return [];
  }
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
  const candidates = buildJanSearchCandidates(janCode);
  const results: PurchaseLinkSearchResult[] = [];

  for (const candidate of candidates) {
    const searchResults =
      candidate.kind === 'jan_code'
        ? await searchYahooItems({ janCode: candidate.value })
        : await searchYahooItems({ query: candidate.value });
    results.push(...searchResults);
    if (dedupePurchaseLinkResults(results).length >= 10) break;
  }

  return dedupePurchaseLinkResults(results);
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
    if ((body.totalResultsAvailable ?? 0) > 0 && (body.hits?.length ?? 0) === 0) {
      console.warn(
        `[purchase-link-search] Yahoo returned totalResultsAvailable=${body.totalResultsAvailable} but no hits. search=${describeYahooSearchOptions(
          searchOptions,
        )}`,
      );
    }
    if ((body.totalResultsAvailable ?? 0) === 0) {
      console.warn(
        `[purchase-link-search] Yahoo returned 0 results. search=${describeYahooSearchOptions(searchOptions)}`,
      );
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

function describeYahooSearchOptions(searchOptions: { query?: string; janCode?: string }): string {
  if (searchOptions.janCode) return `jan_code:${searchOptions.janCode}`;
  if (searchOptions.query) return `query:${searchOptions.query}`;
  return 'empty';
}

function buildJanSearchCandidates(janCode: string): Array<{ kind: 'jan_code' | 'query'; value: string }> {
  const normalizedJanCode = janCode.replace(/\D/g, '');
  const candidates: Array<{ kind: 'jan_code' | 'query'; value: string }> = [];
  if (!normalizedJanCode) return candidates;

  candidates.push({ kind: 'jan_code', value: normalizedJanCode });
  candidates.push({ kind: 'query', value: normalizedJanCode });

  // UPC-A may be reported by some scanners as EAN-13 with a leading zero.
  if (normalizedJanCode.length === 13 && normalizedJanCode.startsWith('0')) {
    candidates.push({ kind: 'query', value: normalizedJanCode.slice(1) });
  }

  return candidates.filter((candidate, index, list) => {
    return list.findIndex((entry) => entry.kind === candidate.kind && entry.value === candidate.value) === index;
  });
}

function dedupePurchaseLinkResults(results: PurchaseLinkSearchResult[]): PurchaseLinkSearchResult[] {
  const seen = new Set<string>();
  return results.filter((result) => {
    const key = result.id || normalizeUrl(result.url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
      ...extraHeaders,
    },
    status,
  });
}
