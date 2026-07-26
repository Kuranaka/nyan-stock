import { createHash } from 'node:crypto';

import { PetProductMaster } from '../../../../packages/shared/src/index.js';

import { config } from '../config.js';
import { forEachWithConcurrency } from './boundedConcurrency.js';
import { petGroupSeeds, petSpeciesGroupSeeds, petSpeciesSeeds } from './masterData.js';
import {
  CatalogProduct,
  CatalogQualitySnapshot,
  NormalizationAlias,
  ProductCandidate,
  ProductSearchQuery,
  RetailerListingInput,
  ReviewIssue,
  StoredRetailerListing,
} from './types.js';

export interface PetCatalogRepository {
  readonly supportsConcurrentWrites: boolean;
  seedReferenceData(): Promise<void>;
  upsertBrand(row: CatalogBrandRow): Promise<void>;
  upsertCategory(row: CatalogCategoryRow): Promise<void>;
  upsertSubcategory(row: CatalogSubcategoryRow): Promise<void>;
  upsertSearchQuery(query: ProductSearchQuery): Promise<void>;
  upsertNormalizationAliases(rows: NormalizationAlias[]): Promise<void>;
  loadRawListings(queryId: string): Promise<StoredRetailerListing[]>;
  loadMergeReadyCandidates(queryId: string): Promise<Array<{ candidate: ProductCandidate; listing: StoredRetailerListing }>>;
  upsertRawListing(listing: RetailerListingInput): Promise<StoredRetailerListing>;
  upsertCandidate(candidate: ProductCandidate): Promise<void>;
  replaceReviewIssues(candidate: ProductCandidate, listing: StoredRetailerListing, issues: ReviewIssue[]): Promise<void>;
  mergeCandidate(candidate: ProductCandidate, listing: StoredRetailerListing): Promise<string>;
  markSearchCompleted(queryId: string, searchedAt: string): Promise<void>;
  loadQualitySnapshot(): Promise<CatalogQualitySnapshot>;
  loadPetProductMasterSnapshot(options?: { petGroup?: string }): Promise<CatalogQualitySnapshot>;
  loadBlockingReviewSnapshot(options?: {
    petGroup?: string;
    candidateIds?: string[];
  }): Promise<CatalogQualitySnapshot>;
  upsertPetProductMasters(rows: PetProductMaster[], concurrency?: number): Promise<void>;
  resolveCanonicalKeyMatches(candidateIds: string[]): Promise<number>;
  reviewBlockingCandidate(input: BlockingReviewDecisionInput): Promise<void>;
  close(): Promise<void>;
}

export type BlockingReviewDecisionInput = {
  candidateId: string;
  decision: 'approve' | 'reject';
  reviewer: string;
  resolutionNote?: string;
  expectedIssueTypes: string[];
};

export const SUPABASE_CONFLICT_TARGETS = {
  petGroups: 'code',
  petGroupTranslations: 'pet_group,locale',
  petSpecies: 'pet_group,code',
  petSpeciesTranslations: 'pet_group,species_code,locale',
  petSpeciesGroups: 'pet_group,code',
  petSpeciesGroupTranslations: 'pet_group,species_group_code,locale',
  petBrands: 'id',
  petBrandTranslations: 'brand_id,locale',
  petCategories: 'id',
  petCategoryTranslations: 'category_id,locale',
  petSubcategories: 'category_id,id',
  petSubcategoryTranslations: 'category_id,subcategory_id,locale',
  productSearchQueries: 'id',
  normalizationAliases: 'id',
  retailerListingsRaw: 'source,source_item_id,search_query_id',
  productCandidates: 'id',
  productReviewQueue: 'candidate_id,issue_type',
  products: 'canonical_key',
  productTranslations: 'product_id,locale',
  productVariants: 'variant_key',
  productIdentityKeys: 'key_type,namespace,normalized_value',
  productRetailerListings: 'product_id,raw_listing_id',
  petProductMasters: 'variant_id',
} as const;

const SUPABASE_RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504, 520, 522, 524]);
const SUPABASE_SELECT_PAGE_SIZE = 1000;
const SUPABASE_FILTER_BATCH_SIZE = 100;
const SUPABASE_RPC_BATCH_SIZE = 1000;
const RETAILER_LISTING_COLUMNS =
  'id,source,source_item_id,search_query_id,search_pet_group,search_target_species,content_locale,market_code,' +
  'raw_title,raw_description,shop_name,brand_name,maker_name,price,currency,item_url,affiliate_url,image_url,' +
  'jan_code,model_number,genre_id,genre_name,availability,fetched_at';
const RETAILER_LISTING_MERGE_COLUMNS =
  'id,source,source_item_id,search_query_id,search_pet_group,content_locale,market_code,raw_title,shop_name,' +
  'brand_name,maker_name,price,currency,item_url,affiliate_url,image_url,jan_code,model_number,availability,fetched_at';
const QUALITY_LISTING_COLUMNS = 'id,raw_title,raw_description';
const QUALITY_CANDIDATE_COLUMNS =
  'id,raw_listing_id,pet_group,target_species,target_species_group,target_scope,target_size,target_age,life_stage,' +
  'habitat_type,feeding_type,flavor,purpose,product_function,classification_evidence,confidence,status';
const QUALITY_PRODUCT_COLUMNS =
  'id,canonical_key,normalized_name,brand,base_product_name,pet_group,target_species,target_species_group,target_scope,' +
  'target_size,target_age,life_stage,habitat_type,feeding_type,flavor,purpose,product_function';
const QUALITY_VARIANT_COLUMNS = 'id,product_id,jan_code';
const QUALITY_IDENTITY_COLUMNS = 'id,variant_id,key_type,normalized_value';
const QUALITY_PRODUCT_LISTING_COLUMNS = 'product_id,raw_listing_id,candidate_id,variant_id';
const QUALITY_REVIEW_COLUMNS = 'id,candidate_id,issue_type,disposition,status';
const SUPABASE_RETRYABLE_ERROR_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'ENETDOWN',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_SOCKET',
]);

type SupabaseFetchRetryOptions = {
  maxRetries: number;
  baseDelayMs: number;
  fetchImpl?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  onRetry?: (event: { attempt: number; maxRetries: number; delayMs: number; reason: string }) => void;
};

export async function fetchWithSupabaseRetry(
  url: string,
  init: RequestInit,
  options: SupabaseFetchRetryOptions,
): Promise<Response> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const maxRetries = Math.max(0, Math.trunc(options.maxRetries));
  const baseDelayMs = Math.max(0, Math.trunc(options.baseDelayMs));

  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await fetchImpl(url, init);
      const retryReason = await retryableSupabaseResponseReason(response);
      if (!retryReason || attempt >= maxRetries) return response;
      const delayMs = retryDelayMs(response.headers.get('retry-after'), baseDelayMs, attempt);
      options.onRetry?.({
        attempt: attempt + 1,
        maxRetries,
        delayMs,
        reason: retryReason,
      });
      await sleep(delayMs);
    } catch (error) {
      if (!isRetryableFetchError(error) || attempt >= maxRetries) throw error;
      const delayMs = retryDelayMs(undefined, baseDelayMs, attempt);
      options.onRetry?.({
        attempt: attempt + 1,
        maxRetries,
        delayMs,
        reason: describeFetchError(error),
      });
      await sleep(delayMs);
    }
  }
}

export async function collectSupabasePages<T>(
  fetchPage: (offset: number, limit: number) => Promise<T[]>,
  pageSize = SUPABASE_SELECT_PAGE_SIZE,
): Promise<T[]> {
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new Error(`Supabase page size must be a positive integer: ${pageSize}`);
  }
  const rows: T[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await fetchPage(offset, pageSize);
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

export function chunkSupabaseFilterValues<T>(values: T[], batchSize = SUPABASE_FILTER_BATCH_SIZE): T[][] {
  if (!Number.isInteger(batchSize) || batchSize <= 0) {
    throw new Error('Supabase filter batch size must be a positive integer.');
  }
  const chunks: T[][] = [];
  for (let offset = 0; offset < values.length; offset += batchSize) {
    chunks.push(values.slice(offset, offset + batchSize));
  }
  return chunks;
}

function blockingReviewSnapshot(
  reviewQueue: Record<string, unknown>[],
  candidates: Record<string, unknown>[],
  listings: Record<string, unknown>[],
): CatalogQualitySnapshot {
  return {
    listings,
    candidates,
    products: [],
    variants: [],
    identityKeys: [],
    productListings: [],
    reviewQueue,
  };
}

function petProductMasterSnapshot(
  products: Record<string, unknown>[],
  variants: Record<string, unknown>[],
  identityKeys: Record<string, unknown>[],
  productListings: Record<string, unknown>[],
  listings: Record<string, unknown>[],
): CatalogQualitySnapshot {
  return {
    listings,
    candidates: [],
    products,
    variants,
    identityKeys,
    productListings,
    reviewQueue: [],
  };
}

export async function openPetCatalogRepository(): Promise<PetCatalogRepository | undefined> {
  if (config.databaseUrl) return PostgresPetCatalogRepository.open(config.databaseUrl);
  if (config.supabaseUrl && config.supabaseServiceRoleKey) return new SupabasePetCatalogRepository();
  return undefined;
}

class PostgresPetCatalogRepository implements PetCatalogRepository {
  readonly supportsConcurrentWrites = false;

  private constructor(private readonly client: PgClient) {}

  static async open(connectionString: string): Promise<PostgresPetCatalogRepository> {
    const { Client } = await import('pg');
    const client = new Client({ connectionString }) as PgClient;
    await client.connect();
    return new PostgresPetCatalogRepository(client);
  }

  async seedReferenceData(): Promise<void> {
    await this.client.query('begin');
    try {
      for (const item of petGroupSeeds) {
        await this.client.query(
          `insert into public.pet_groups (code, name_ja, name_en, sort_order, enabled)
           values ($1,$2,$3,$4,true)
           on conflict (code) do update set
             name_ja=excluded.name_ja, name_en=excluded.name_en,
             sort_order=excluded.sort_order, enabled=excluded.enabled`,
          [item.code, item.nameJa, item.nameEn, item.sortOrder],
        );
      }
      for (const item of petSpeciesSeeds) {
        await this.client.query(
          `insert into public.pet_species (
             pet_group, code, parent_species_code, name_ja, name_en, sort_order, enabled
           ) values ($1,$2,$3,$4,$5,$6,$7)
           on conflict (pet_group, code) do update set
             parent_species_code=excluded.parent_species_code, name_ja=excluded.name_ja,
             name_en=excluded.name_en, sort_order=excluded.sort_order, enabled=excluded.enabled`,
          [item.petGroup, item.code, item.parentSpeciesCode ?? null, item.nameJa, item.nameEn, item.sortOrder, item.enabled],
        );
      }
      for (const item of petSpeciesGroupSeeds) {
        await this.client.query(
          `insert into public.pet_species_groups (pet_group, code, name_ja, name_en, sort_order, enabled)
           values ($1,$2,$3,$4,$5,$6)
           on conflict (pet_group, code) do update set
             name_ja=excluded.name_ja, name_en=excluded.name_en,
             sort_order=excluded.sort_order, enabled=excluded.enabled`,
          [item.petGroup, item.code, item.nameJa, item.nameEn, item.sortOrder, item.enabled],
        );
      }
      await this.client.query(
        `insert into public.pet_group_translations (pet_group, locale, name)
         select code, locale, name
         from public.pet_groups
         cross join lateral (values ('ja-JP', name_ja), ('en', name_en)) as translation(locale, name)
         where nullif(btrim(name), '') is not null
         on conflict (pet_group, locale) do update set name=excluded.name, updated_at=now()`,
      );
      await this.client.query(
        `insert into public.pet_species_translations (pet_group, species_code, locale, name)
         select pet_group, code, locale, name
         from public.pet_species
         cross join lateral (values ('ja-JP', name_ja), ('en', name_en)) as translation(locale, name)
         where nullif(btrim(name), '') is not null
         on conflict (pet_group, species_code, locale) do update set name=excluded.name, updated_at=now()`,
      );
      await this.client.query(
        `insert into public.pet_species_group_translations (pet_group, species_group_code, locale, name)
         select pet_group, code, locale, name
         from public.pet_species_groups
         cross join lateral (values ('ja-JP', name_ja), ('en', name_en)) as translation(locale, name)
         where nullif(btrim(name), '') is not null
         on conflict (pet_group, species_group_code, locale) do update set name=excluded.name, updated_at=now()`,
      );
      await this.client.query('commit');
    } catch (error) {
      await this.client.query('rollback');
      throw error;
    }
  }

  async upsertBrand(row: CatalogBrandRow): Promise<void> {
    await this.client.query(
      `insert into public.pet_brands (id, name_ja, name_en, manufacturer, normalized_name, updated_at)
       values ($1,$2,$3,$4,$5,now())
       on conflict (id) do update set
         name_ja=excluded.name_ja, name_en=excluded.name_en,
         manufacturer=excluded.manufacturer, normalized_name=excluded.normalized_name,
         updated_at=now()`,
      [row.id, row.nameJa, row.nameEn ?? null, row.manufacturer ?? null, row.normalizedName],
    );
    await this.client.query(
      `insert into public.pet_brand_translations (brand_id, locale, name)
       select $1, locale, name
       from (values ('ja-JP', $2::text), ('en', $3::text)) as translation(locale, name)
       where nullif(btrim(name), '') is not null
       on conflict (brand_id, locale) do update set name=excluded.name, updated_at=now()`,
      [row.id, row.nameJa, row.nameEn ?? null],
    );
  }

  async upsertCategory(row: CatalogCategoryRow): Promise<void> {
    await this.client.query(
      `insert into public.pet_categories (id, name_ja, name_en, sort_order, enabled)
       values ($1,$2,$3,$4,$5)
       on conflict (id) do update set
         name_ja=excluded.name_ja, name_en=excluded.name_en,
         sort_order=excluded.sort_order, enabled=excluded.enabled`,
      [row.id, row.nameJa, row.nameEn, row.sortOrder, row.enabled],
    );
    await this.client.query(
      `insert into public.pet_category_translations (category_id, locale, name)
       select $1, locale, name from (values ('ja-JP', $2::text), ('en', $3::text)) as translation(locale, name)
       where nullif(btrim(name), '') is not null
       on conflict (category_id, locale) do update set name=excluded.name, updated_at=now()`,
      [row.id, row.nameJa, row.nameEn],
    );
  }

  async upsertSubcategory(row: CatalogSubcategoryRow): Promise<void> {
    await this.client.query(
      `insert into public.pet_subcategories (id, category_id, name_ja, name_en, sort_order, enabled)
       values ($1,$2,$3,$4,$5,$6)
       on conflict (category_id, id) do update set
         category_id=excluded.category_id, name_ja=excluded.name_ja,
         name_en=excluded.name_en, sort_order=excluded.sort_order, enabled=excluded.enabled`,
      [row.id, row.categoryId, row.nameJa, row.nameEn, row.sortOrder, row.enabled],
    );
    await this.client.query(
      `insert into public.pet_subcategory_translations (category_id, subcategory_id, locale, name)
       select $1, $2, locale, name
       from (values ('ja-JP', $3::text), ('en', $4::text)) as translation(locale, name)
       where nullif(btrim(name), '') is not null
       on conflict (category_id, subcategory_id, locale) do update set name=excluded.name, updated_at=now()`,
      [row.categoryId, row.id, row.nameJa, row.nameEn],
    );
  }

  async upsertSearchQuery(query: ProductSearchQuery): Promise<void> {
    await this.client.query(
      `insert into public.product_search_queries (
         id, pet_group, target_species, target_species_group, category_id, subcategory_id,
         keyword, negative_keywords, rakuten_genre_id, yahoo_genre_category_id,
         yahoo_brand_id, priority, enabled, max_pages, locale, market_code,
         currency_code, last_searched_at, updated_at
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,now())
       on conflict (id) do update set
         pet_group=excluded.pet_group, target_species=excluded.target_species,
         target_species_group=excluded.target_species_group, category_id=excluded.category_id,
         subcategory_id=excluded.subcategory_id, keyword=excluded.keyword,
         negative_keywords=excluded.negative_keywords, rakuten_genre_id=excluded.rakuten_genre_id,
         yahoo_genre_category_id=excluded.yahoo_genre_category_id, yahoo_brand_id=excluded.yahoo_brand_id,
         priority=excluded.priority, enabled=excluded.enabled, max_pages=excluded.max_pages,
         locale=excluded.locale, market_code=excluded.market_code, currency_code=excluded.currency_code,
         updated_at=now()`,
      searchQueryValues(query),
    );
  }

  async upsertNormalizationAliases(rows: NormalizationAlias[]): Promise<void> {
    for (const row of rows) {
      await this.client.query(
        `insert into public.normalization_aliases (
           id, alias_type, locale, alias, normalized_alias, canonical_value,
           context_value, display_value, priority, enabled, updated_at
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
         on conflict (id) do update set
           alias_type=excluded.alias_type, locale=excluded.locale, alias=excluded.alias,
           normalized_alias=excluded.normalized_alias, canonical_value=excluded.canonical_value,
           context_value=excluded.context_value, display_value=excluded.display_value,
           priority=excluded.priority, enabled=excluded.enabled, updated_at=now()`,
        [
          row.id,
          row.aliasType,
          row.locale,
          row.alias,
          row.normalizedAlias,
          row.canonicalValue,
          row.contextValue ?? '',
          row.displayValue ?? null,
          row.priority,
          row.enabled,
        ],
      );
    }
  }

  async loadRawListings(queryId: string): Promise<StoredRetailerListing[]> {
    const result = await this.client.query(
      `select id::text, source, source_item_id, search_query_id, search_pet_group,
              search_target_species, content_locale, market_code, raw_title, raw_description,
              shop_name, brand_name, maker_name, price, currency, item_url, affiliate_url, image_url, jan_code,
              model_number, genre_id, genre_name, availability, fetched_at
       from public.retailer_listings_raw
       where search_query_id=$1
       order by source, source_item_id`,
      [queryId],
    );
    return result.rows.map(storedListingFromRow);
  }

  async loadMergeReadyCandidates(
    queryId: string,
  ): Promise<Array<{ candidate: ProductCandidate; listing: StoredRetailerListing }>> {
    const result = await this.client.query(
      `select to_jsonb(candidate) as candidate,
              listing.id::text, listing.source, listing.source_item_id, listing.search_query_id,
              listing.search_pet_group, listing.content_locale, listing.market_code,
              listing.raw_title, listing.shop_name, listing.brand_name, listing.maker_name,
              listing.price, listing.currency, listing.item_url, listing.affiliate_url,
              listing.image_url, listing.jan_code, listing.model_number, listing.availability,
              listing.fetched_at
       from public.product_candidates candidate
       join public.retailer_listings_raw listing on listing.id=candidate.raw_listing_id
       where candidate.status='merge_ready' and listing.search_query_id=$1
       order by candidate.id`,
      [queryId],
    );
    return result.rows.map((row) => ({
      candidate: candidateFromRow(row.candidate as Record<string, unknown>),
      listing: storedListingFromRow(row),
    }));
  }

  async upsertRawListing(listing: RetailerListingInput): Promise<StoredRetailerListing> {
    const result = await this.client.query<{ id: string }>(
      `insert into public.retailer_listings_raw (
         source, source_item_id, search_query_id, search_pet_group, search_target_species,
         content_locale, market_code, raw_title, raw_description, shop_name, brand_name,
         maker_name, price, currency, item_url,
         affiliate_url, image_url, jan_code, model_number, genre_id, genre_name,
         availability, fetched_at, raw_json, updated_at
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24::jsonb,now())
       on conflict (source, source_item_id, search_query_id) do update set
         search_pet_group=excluded.search_pet_group, search_target_species=excluded.search_target_species,
         content_locale=excluded.content_locale, market_code=excluded.market_code,
         raw_title=excluded.raw_title, raw_description=excluded.raw_description,
         shop_name=excluded.shop_name, brand_name=excluded.brand_name, maker_name=excluded.maker_name,
         price=excluded.price, currency=excluded.currency, item_url=excluded.item_url, affiliate_url=excluded.affiliate_url,
         image_url=excluded.image_url, jan_code=excluded.jan_code, model_number=excluded.model_number,
         genre_id=excluded.genre_id, genre_name=excluded.genre_name, availability=excluded.availability,
         fetched_at=excluded.fetched_at, raw_json=excluded.raw_json, updated_at=now()
       returning id::text`,
      rawListingValues(listing),
    );
    return { ...listing, id: result.rows[0].id };
  }

  async upsertCandidate(candidate: ProductCandidate): Promise<void> {
    await this.client.query(
      `insert into public.product_candidates (
         id, raw_listing_id, source_locale, normalized_name, brand, series, base_product_name, pet_group,
         target_species, target_species_group, target_scope, target_size, target_age,
         life_stage, habitat_type, feeding_type, flavor, primary_ingredient, purpose,
         product_function, package_type, category_id, subcategory_id, capacity_value,
         capacity_unit, quantity, jan_code, model_number, canonical_key,
         classification_evidence, classification_confidence, merge_confidence,
         confidence, status, updated_at
       ) values (
         $1,$2::uuid,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
         $19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30::jsonb,$31,$32,$33,$34,now()
       ) on conflict (id) do update set
         raw_listing_id=excluded.raw_listing_id, source_locale=excluded.source_locale,
         normalized_name=excluded.normalized_name,
         brand=excluded.brand, series=excluded.series, base_product_name=excluded.base_product_name,
         pet_group=excluded.pet_group, target_species=excluded.target_species,
         target_species_group=excluded.target_species_group, target_scope=excluded.target_scope,
         target_size=excluded.target_size, target_age=excluded.target_age, life_stage=excluded.life_stage,
         habitat_type=excluded.habitat_type, feeding_type=excluded.feeding_type,
         flavor=excluded.flavor, primary_ingredient=excluded.primary_ingredient,
         purpose=excluded.purpose, product_function=excluded.product_function,
         package_type=excluded.package_type, category_id=excluded.category_id,
         subcategory_id=excluded.subcategory_id, capacity_value=excluded.capacity_value,
         capacity_unit=excluded.capacity_unit, quantity=excluded.quantity,
         jan_code=excluded.jan_code, model_number=excluded.model_number,
         canonical_key=excluded.canonical_key, classification_evidence=excluded.classification_evidence,
         classification_confidence=excluded.classification_confidence,
         merge_confidence=excluded.merge_confidence, confidence=excluded.confidence,
         status=excluded.status, updated_at=now()`,
      candidateValues(candidate),
    );
    if (candidate.status !== 'merge_ready') {
      const previousProducts = await this.client.query<{ product_id: string }>(
        'select product_id from public.product_retailer_listings where candidate_id=$1',
        [candidate.id],
      );
      await this.client.query('delete from public.product_retailer_listings where candidate_id=$1', [candidate.id]);
      for (const previous of previousProducts.rows) {
        await this.client.query(
          `delete from public.products product
           where product.id=$1 and product.status='draft'
             and not exists (
               select 1 from public.product_retailer_listings listing where listing.product_id=product.id
             )`,
          [previous.product_id],
        );
      }
    }
  }

  async replaceReviewIssues(
    candidate: ProductCandidate,
    listing: StoredRetailerListing,
    issues: ReviewIssue[],
  ): Promise<void> {
    await this.client.query('delete from public.product_review_queue where candidate_id=$1', [candidate.id]);
    for (const issue of issues) {
      await this.client.query(
        `insert into public.product_review_queue (
           candidate_id, raw_listing_id, pet_group, detected_target_species, issue_type,
           issue_detail, source_url, suggested_action, confidence, disposition, policy_reason,
           status, checked_at, checked_by, resolution_note, updated_at
         ) values ($1,$2::uuid,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,now())
         on conflict (candidate_id, issue_type) do update set
           raw_listing_id=excluded.raw_listing_id, pet_group=excluded.pet_group,
           detected_target_species=excluded.detected_target_species,
           issue_detail=excluded.issue_detail, source_url=excluded.source_url,
           suggested_action=excluded.suggested_action, confidence=excluded.confidence,
           disposition=excluded.disposition, policy_reason=excluded.policy_reason,
           status=excluded.status, checked_at=excluded.checked_at, checked_by=excluded.checked_by,
           resolution_note=excluded.resolution_note, updated_at=now()`,
        reviewValues(candidate, listing, issue),
      );
    }
  }

  async mergeCandidate(candidate: ProductCandidate, listing: StoredRetailerListing): Promise<string> {
    if (!candidate.petGroup || candidate.targetScope === 'unconfirmed') {
      throw new Error(`Candidate ${candidate.id} cannot be merged without a confirmed pet group and target scope.`);
    }
    const proposedProductId = productIdFromCanonicalKey(candidate.canonicalKey);
    const identityKeys = buildProductIdentityKeys(candidate, listing);
    await this.client.query('begin');
    try {
      let existingVariant: ExistingVariantIdentity | undefined;
      for (const key of identityKeys) {
        const result = await this.client.query<ExistingVariantIdentity>(
          `select variant.id as variant_id, variant.product_id, variant.variant_key
           from public.product_identity_keys identity_key
           join public.product_variants variant on variant.id=identity_key.variant_id
           where identity_key.key_type=$1 and identity_key.namespace=$2 and identity_key.normalized_value=$3
           limit 1`,
          [key.keyType, key.namespace, key.normalizedValue],
        );
        if (result.rows[0]) {
          if (existingVariant && existingVariant.variant_id !== result.rows[0].variant_id) {
            throw new Error(
              `Candidate ${candidate.id} has conflicting JAN/model identities: ` +
                `${existingVariant.variant_id} vs ${result.rows[0].variant_id}`,
            );
          }
          existingVariant = result.rows[0];
        }
      }
      let actualProductId = existingVariant?.product_id;
      if (!actualProductId) {
        await this.client.query(
          `insert into public.products (
             id, canonical_key, source_locale, normalized_name, brand, series, base_product_name, pet_group,
             target_species, target_species_group, target_scope, target_size, target_age,
             life_stage, habitat_type, feeding_type, flavor, primary_ingredient, purpose,
             product_function, package_type, category_id, subcategory_id, confidence, status, updated_at
           ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,'draft',now())
           on conflict (canonical_key) do update set
             confidence=greatest(products.confidence, excluded.confidence), updated_at=now()`,
          productValues(proposedProductId, candidate),
        );
        const resolvedProduct = await this.client.query<{ id: string }>(
          'select id from public.products where canonical_key=$1',
          [candidate.canonicalKey],
        );
        actualProductId = resolvedProduct.rows[0].id;
      }
      await this.client.query(
        `update public.products
         set normalized_name=$2, base_product_name=$3,
             confidence=greatest(confidence, $4), updated_at=now()
         where id=$1`,
        [actualProductId, candidate.normalizedName, candidate.baseProductName, candidate.confidence],
      );
      const variantKey = existingVariant?.variant_key ?? buildProductVariantKey(actualProductId, candidate, listing, identityKeys);
      const variantId = existingVariant?.variant_id ?? productVariantId(variantKey);
      await this.client.query(
        `insert into public.product_variants (
           id, product_id, variant_key, capacity_value, capacity_unit, quantity,
           jan_code, model_number, package_type, status, updated_at
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'active',now())
         on conflict (variant_key) do update set
           capacity_value=coalesce(excluded.capacity_value, product_variants.capacity_value),
           capacity_unit=coalesce(excluded.capacity_unit, product_variants.capacity_unit),
           quantity=coalesce(excluded.quantity, product_variants.quantity),
           jan_code=coalesce(excluded.jan_code, product_variants.jan_code),
           model_number=coalesce(excluded.model_number, product_variants.model_number),
           package_type=coalesce(excluded.package_type, product_variants.package_type), updated_at=now()`,
        productVariantValues(variantId, actualProductId, variantKey, candidate),
      );
      for (const key of identityKeys) {
        await this.client.query(
          `insert into public.product_identity_keys (
             variant_id, key_type, namespace, normalized_value, source, confidence, updated_at
           ) values ($1,$2,$3,$4,$5,$6,now())
           on conflict (key_type, namespace, normalized_value) do update set
             source=excluded.source, confidence=greatest(product_identity_keys.confidence, excluded.confidence), updated_at=now()`,
          [variantId, key.keyType, key.namespace, key.normalizedValue, key.source, key.confidence],
        );
      }
      await this.client.query(
        `insert into public.product_translations (
           product_id, locale, display_name, normalized_name, base_product_name, source, status, updated_at
         ) values ($1,$2,$3,$4,$5,'pipeline','draft',now())
         on conflict (product_id, locale) do update set
           display_name=excluded.display_name, normalized_name=excluded.normalized_name,
           base_product_name=excluded.base_product_name, updated_at=now()`,
        productTranslationValues(actualProductId, candidate),
      );
      const previousProducts = await this.client.query<{ product_id: string }>(
        'select product_id from public.product_retailer_listings where candidate_id=$1',
        [candidate.id],
      );
      await this.client.query('delete from public.product_retailer_listings where candidate_id=$1', [candidate.id]);
      await this.client.query(
        `insert into public.product_retailer_listings (
           product_id, variant_id, raw_listing_id, candidate_id, capacity_value, capacity_unit,
           quantity, jan_code, model_number, price, item_url, affiliate_url, availability
         ) values ($1,$2,$3::uuid,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         on conflict (product_id, raw_listing_id) do update set
           variant_id=excluded.variant_id, candidate_id=excluded.candidate_id, capacity_value=excluded.capacity_value,
           capacity_unit=excluded.capacity_unit, quantity=excluded.quantity,
           jan_code=excluded.jan_code, model_number=excluded.model_number,
           price=excluded.price, item_url=excluded.item_url,
           affiliate_url=excluded.affiliate_url, availability=excluded.availability,
           linked_at=now()`,
        productListingValues(actualProductId, variantId, candidate, listing),
      );
      for (const previous of previousProducts.rows) {
        if (previous.product_id === actualProductId) continue;
        await this.client.query(
          `delete from public.products p
           where p.id=$1 and p.status='draft'
             and not exists (
               select 1 from public.product_retailer_listings listing where listing.product_id=p.id
             )`,
          [previous.product_id],
        );
      }
      await this.client.query("update public.product_candidates set status='merged', updated_at=now() where id=$1", [candidate.id]);
      await this.client.query(
        `update public.product_review_queue
         set status='resolved', resolution_note='高信頼候補の明示的なmerge工程で統合済み。', updated_at=now()
         where candidate_id=$1 and issue_type='initial_review_required' and status='open'`,
        [candidate.id],
      );
      await this.client.query('commit');
      return actualProductId;
    } catch (error) {
      await this.client.query('rollback');
      throw error;
    }
  }

  async markSearchCompleted(queryId: string, searchedAt: string): Promise<void> {
    await this.client.query(
      'update public.product_search_queries set last_searched_at=$2, updated_at=now() where id=$1',
      [queryId, searchedAt],
    );
  }

  async loadQualitySnapshot(): Promise<CatalogQualitySnapshot> {
    const listings = await this.client.query('select * from public.retailer_listings_raw');
    const candidates = await this.client.query('select * from public.product_candidates');
    const products = await this.client.query('select * from public.products');
    const variants = await this.client.query('select * from public.product_variants');
    const identityKeys = await this.client.query('select * from public.product_identity_keys');
    const productListings = await this.client.query('select * from public.product_retailer_listings');
    const reviewQueue = await this.client.query('select * from public.product_review_queue');
    return {
      listings: listings.rows,
      candidates: candidates.rows,
      products: products.rows,
      variants: variants.rows,
      identityKeys: identityKeys.rows,
      productListings: productListings.rows,
      reviewQueue: reviewQueue.rows,
    };
  }

  async loadPetProductMasterSnapshot(
    options: { petGroup?: string } = {},
  ): Promise<CatalogQualitySnapshot> {
    const products = await this.client.query(
      `select * from public.products
       where ($1::text is null or pet_group=$1)
       order by id`,
      [options.petGroup ?? null],
    );
    const productIds = products.rows.map((row) => String(row.id));
    if (productIds.length === 0) return petProductMasterSnapshot([], [], [], [], []);

    const variants = await this.client.query(
      'select * from public.product_variants where product_id=any($1::text[]) order by id',
      [productIds],
    );
    const variantIds = variants.rows.map((row) => String(row.id));
    if (variantIds.length === 0) return petProductMasterSnapshot(products.rows, [], [], [], []);

    const identityKeys = await this.client.query(
      'select * from public.product_identity_keys where variant_id=any($1::text[]) order by id',
      [variantIds],
    );
    const productListings = await this.client.query(
      `select * from public.product_retailer_listings
       where variant_id=any($1::text[])
       order by product_id, raw_listing_id`,
      [variantIds],
    );
    const rawListingIds = [...new Set(productListings.rows.map((row) => String(row.raw_listing_id)))];
    const listings = rawListingIds.length === 0
      ? { rows: [] }
      : await this.client.query(
          `select id::text, source, source_item_id, shop_name, price, currency,
                  item_url, affiliate_url, image_url, availability, fetched_at, market_code
           from public.retailer_listings_raw
           where id=any($1::uuid[])
           order by id`,
          [rawListingIds],
        );
    return petProductMasterSnapshot(
      products.rows,
      variants.rows,
      identityKeys.rows,
      productListings.rows,
      listings.rows,
    );
  }

  async loadBlockingReviewSnapshot(
    options: { petGroup?: string; candidateIds?: string[] } = {},
  ): Promise<CatalogQualitySnapshot> {
    const reviewQueue = await this.client.query(
      `select id, candidate_id, pet_group, issue_type, issue_detail, source_url,
              suggested_action, confidence, status, disposition
       from public.product_review_queue
       where disposition='blocking' and status='open'
         and ($1::text is null or pet_group=$1)
         and ($2::text[] is null or candidate_id=any($2::text[]))
       order by id`,
      [options.petGroup ?? null, options.candidateIds ?? null],
    );
    const candidateIds = [...new Set(reviewQueue.rows.map((row) => String(row.candidate_id)))];
    if (candidateIds.length === 0) return blockingReviewSnapshot(reviewQueue.rows, [], []);
    const candidates = await this.client.query(
      `select id, raw_listing_id, normalized_name, brand, pet_group, target_species,
              target_scope, category_id, subcategory_id, confidence, jan_code, model_number
       from public.product_candidates where id=any($1::text[]) order by id`,
      [candidateIds],
    );
    const rawListingIds = [...new Set(candidates.rows.map((row) => String(row.raw_listing_id)))];
    const listings = await this.client.query(
      `select id, source, raw_title, item_url, image_url, jan_code, model_number
       from public.retailer_listings_raw where id=any($1::uuid[]) order by id`,
      [rawListingIds],
    );
    return blockingReviewSnapshot(reviewQueue.rows, candidates.rows, listings.rows);
  }

  async reviewBlockingCandidate(input: BlockingReviewDecisionInput): Promise<void> {
    await this.client.query(
      'select * from public.review_pet_catalog_candidate($1,$2,$3,$4,$5)',
      [
        input.candidateId,
        input.decision,
        input.reviewer,
        input.resolutionNote ?? null,
        input.expectedIssueTypes,
      ],
    );
  }

  async resolveCanonicalKeyMatches(candidateIds: string[]): Promise<number> {
    let resolvedCount = 0;
    for (let offset = 0; offset < candidateIds.length; offset += SUPABASE_RPC_BATCH_SIZE) {
      const result = await this.client.query<{ resolved_count: number }>(
        'select public.resolve_pet_catalog_exact_name_brand_matches($1::text[]) as resolved_count',
        [candidateIds.slice(offset, offset + SUPABASE_RPC_BATCH_SIZE)],
      );
      resolvedCount += Number(result.rows[0]?.resolved_count ?? 0);
    }
    return resolvedCount;
  }

  async upsertPetProductMasters(rows: PetProductMaster[], _concurrency = 1): Promise<void> {
    if (rows.length === 0) return;
    await this.client.query('begin');
    try {
      for (const row of rows) {
        await this.client.query(
          `insert into public.pet_product_masters (
             id, product_id, variant_id, pet_group, target_species, target_scope,
             category_id, subcategory_id, normalized_name, brand, jan_code,
             status, source_locale, data, published_at, updated_at
           ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,
             case when $12='published' then now() else null end, now())
           on conflict (variant_id) do update set
             product_id=excluded.product_id, pet_group=excluded.pet_group,
             target_species=excluded.target_species, target_scope=excluded.target_scope,
             category_id=excluded.category_id, subcategory_id=excluded.subcategory_id,
             normalized_name=excluded.normalized_name, brand=excluded.brand,
             jan_code=excluded.jan_code, status=excluded.status,
             source_locale=excluded.source_locale, data=excluded.data,
             published_at=case
               when excluded.status='published' then coalesce(pet_product_masters.published_at, now())
               else pet_product_masters.published_at
             end,
             updated_at=now()`,
          petProductMasterValues(row),
        );
      }
      await this.client.query('commit');
    } catch (error) {
      await this.client.query('rollback');
      throw error;
    }
  }

  async close(): Promise<void> {
    await this.client.end();
  }
}

class SupabasePetCatalogRepository implements PetCatalogRepository {
  readonly supportsConcurrentWrites = true;

  async seedReferenceData(): Promise<void> {
    await this.upsert(
      'pet_groups',
      petGroupSeeds.map((item) => ({
        code: item.code,
        name_ja: item.nameJa,
        name_en: item.nameEn,
        sort_order: item.sortOrder,
        enabled: true,
      })),
      SUPABASE_CONFLICT_TARGETS.petGroups,
    );
    for (const item of petSpeciesSeeds) {
      await this.upsert(
        'pet_species',
        [{
          pet_group: item.petGroup,
          code: item.code,
          parent_species_code: item.parentSpeciesCode ?? null,
          name_ja: item.nameJa,
          name_en: item.nameEn,
          sort_order: item.sortOrder,
          enabled: item.enabled,
        }],
        SUPABASE_CONFLICT_TARGETS.petSpecies,
      );
    }
    await this.upsert(
      'pet_species_groups',
      petSpeciesGroupSeeds.map((item) => ({
        pet_group: item.petGroup,
        code: item.code,
        name_ja: item.nameJa,
        name_en: item.nameEn,
        sort_order: item.sortOrder,
        enabled: item.enabled,
      })),
      SUPABASE_CONFLICT_TARGETS.petSpeciesGroups,
    );
    await this.upsert(
      'pet_group_translations',
      petGroupSeeds.flatMap((item) => localizedRows({ pet_group: item.code }, item.nameJa, item.nameEn)),
      SUPABASE_CONFLICT_TARGETS.petGroupTranslations,
    );
    await this.upsert(
      'pet_species_translations',
      petSpeciesSeeds.flatMap((item) =>
        localizedRows({ pet_group: item.petGroup, species_code: item.code }, item.nameJa, item.nameEn),
      ),
      SUPABASE_CONFLICT_TARGETS.petSpeciesTranslations,
    );
    await this.upsert(
      'pet_species_group_translations',
      petSpeciesGroupSeeds.flatMap((item) =>
        localizedRows({ pet_group: item.petGroup, species_group_code: item.code }, item.nameJa, item.nameEn),
      ),
      SUPABASE_CONFLICT_TARGETS.petSpeciesGroupTranslations,
    );
  }

  async upsertBrand(row: CatalogBrandRow): Promise<void> {
    await this.upsert(
      'pet_brands',
      [{
        id: row.id,
        name_ja: row.nameJa,
        name_en: row.nameEn ?? null,
        manufacturer: row.manufacturer ?? null,
        normalized_name: row.normalizedName,
      }],
      SUPABASE_CONFLICT_TARGETS.petBrands,
    );
    await this.upsert(
      'pet_brand_translations',
      localizedRows({ brand_id: row.id }, row.nameJa, row.nameEn),
      SUPABASE_CONFLICT_TARGETS.petBrandTranslations,
    );
  }

  async upsertCategory(row: CatalogCategoryRow): Promise<void> {
    await this.upsert(
      'pet_categories',
      [{ id: row.id, name_ja: row.nameJa, name_en: row.nameEn, sort_order: row.sortOrder, enabled: row.enabled }],
      SUPABASE_CONFLICT_TARGETS.petCategories,
    );
    await this.upsert(
      'pet_category_translations',
      localizedRows({ category_id: row.id }, row.nameJa, row.nameEn),
      SUPABASE_CONFLICT_TARGETS.petCategoryTranslations,
    );
  }

  async upsertSubcategory(row: CatalogSubcategoryRow): Promise<void> {
    await this.upsert(
      'pet_subcategories',
      [{
        id: row.id,
        category_id: row.categoryId,
        name_ja: row.nameJa,
        name_en: row.nameEn,
        sort_order: row.sortOrder,
        enabled: row.enabled,
      }],
      SUPABASE_CONFLICT_TARGETS.petSubcategories,
    );
    await this.upsert(
      'pet_subcategory_translations',
      localizedRows({ category_id: row.categoryId, subcategory_id: row.id }, row.nameJa, row.nameEn),
      SUPABASE_CONFLICT_TARGETS.petSubcategoryTranslations,
    );
  }

  async upsertSearchQuery(query: ProductSearchQuery): Promise<void> {
    await this.upsert(
      'product_search_queries',
      [searchQueryRow(query)],
      SUPABASE_CONFLICT_TARGETS.productSearchQueries,
    );
  }

  async upsertNormalizationAliases(rows: NormalizationAlias[]): Promise<void> {
    await this.upsert(
      'normalization_aliases',
      rows.map((row) => ({
        id: row.id,
        alias_type: row.aliasType,
        locale: row.locale,
        alias: row.alias,
        normalized_alias: row.normalizedAlias,
        canonical_value: row.canonicalValue,
        context_value: row.contextValue ?? '',
        display_value: row.displayValue ?? null,
        priority: row.priority,
        enabled: row.enabled,
      })),
      SUPABASE_CONFLICT_TARGETS.normalizationAliases,
    );
  }

  async loadRawListings(queryId: string): Promise<StoredRetailerListing[]> {
    const rows = await collectSupabasePages((offset, limit) =>
      this.select(
        'retailer_listings_raw',
        `select=${RETAILER_LISTING_COLUMNS}&search_query_id=eq.${encodeURIComponent(queryId)}` +
          `&order=source.asc,source_item_id.asc,id.asc&offset=${offset}&limit=${limit}`,
      ),
    );
    return rows.map(storedListingFromRow);
  }

  async loadMergeReadyCandidates(
    queryId: string,
  ): Promise<Array<{ candidate: ProductCandidate; listing: StoredRetailerListing }>> {
    const listingRows = await collectSupabasePages((offset, limit) =>
      this.select(
        'retailer_listings_raw',
        `select=${RETAILER_LISTING_MERGE_COLUMNS}&search_query_id=eq.${encodeURIComponent(queryId)}` +
          `&order=source.asc,source_item_id.asc,id.asc&offset=${offset}&limit=${limit}`,
      ),
    );
    const listings = listingRows.map(storedListingFromRow);
    if (listings.length === 0) return [];
    const listingsById = new Map(listings.map((listing) => [listing.id, listing]));
    const candidateRows: Record<string, unknown>[] = [];
    for (const listingIds of chunkSupabaseFilterValues(
      listings.map((listing) => listing.id),
      SUPABASE_FILTER_BATCH_SIZE,
    )) {
      const encodedIds = listingIds.map((id) => encodeURIComponent(id)).join(',');
      const rows = await collectSupabasePages((offset, limit) =>
        this.select(
          'product_candidates',
          'select=*' +
            '&status=eq.merge_ready' +
            `&raw_listing_id=in.(${encodedIds})` +
            `&order=id.asc&offset=${offset}&limit=${limit}`,
        ),
      );
      candidateRows.push(...rows);
    }
    return candidateRows
      .sort((left, right) => String(left.id).localeCompare(String(right.id)))
      .map((row) => {
        const listing = listingsById.get(String(row.raw_listing_id ?? ''));
        if (!listing) throw new Error(`[pet-catalog:repository] Candidate ${String(row.id)} has no raw listing.`);
        return { candidate: candidateFromRow(row), listing };
      });
  }

  async upsertRawListing(listing: RetailerListingInput): Promise<StoredRetailerListing> {
    const rows = await this.upsert(
      'retailer_listings_raw',
      [rawListingRow(listing)],
      SUPABASE_CONFLICT_TARGETS.retailerListingsRaw,
      true,
    );
    return { ...listing, id: String(rows[0].id) };
  }

  async upsertCandidate(candidate: ProductCandidate): Promise<void> {
    await this.upsert(
      'product_candidates',
      [candidateRow(candidate)],
      SUPABASE_CONFLICT_TARGETS.productCandidates,
    );
    if (candidate.status !== 'merge_ready') {
      const previousLinks = await this.select(
        'product_retailer_listings',
        `select=product_id&candidate_id=eq.${encodeURIComponent(candidate.id)}`,
      );
      await this.delete('product_retailer_listings', `candidate_id=eq.${encodeURIComponent(candidate.id)}`);
      for (const previousLink of previousLinks) {
        const previousProductId = String(previousLink.product_id ?? '');
        if (!previousProductId) continue;
        const remainingLinks = await this.select(
          'product_retailer_listings',
          `select=product_id&product_id=eq.${encodeURIComponent(previousProductId)}&limit=1`,
        );
        if (remainingLinks.length === 0) {
          await this.delete('products', `id=eq.${encodeURIComponent(previousProductId)}&status=eq.draft`);
        }
      }
    }
  }

  async replaceReviewIssues(
    candidate: ProductCandidate,
    listing: StoredRetailerListing,
    issues: ReviewIssue[],
  ): Promise<void> {
    await this.delete('product_review_queue', `candidate_id=eq.${encodeURIComponent(candidate.id)}`);
    if (issues.length === 0) return;
    await this.upsert(
      'product_review_queue',
      issues.map((issue) => reviewRow(candidate, listing, issue)),
      SUPABASE_CONFLICT_TARGETS.productReviewQueue,
    );
  }

  async mergeCandidate(candidate: ProductCandidate, listing: StoredRetailerListing): Promise<string> {
    if (!candidate.petGroup || candidate.targetScope === 'unconfirmed') {
      throw new Error(`Candidate ${candidate.id} cannot be merged without a confirmed pet group and target scope.`);
    }
    const identityKeys = buildProductIdentityKeys(candidate, listing);
    let existingVariant: ExistingVariantIdentity | undefined;
    for (const key of identityKeys) {
      const identities = await this.select(
        'product_identity_keys',
        `select=variant_id&key_type=eq.${key.keyType}&namespace=eq.${encodeURIComponent(key.namespace)}` +
          `&normalized_value=eq.${encodeURIComponent(key.normalizedValue)}&limit=1`,
      );
      if (identities[0]?.variant_id) {
        const variants = await this.select(
          'product_variants',
          `select=id,product_id,variant_key&id=eq.${encodeURIComponent(String(identities[0].variant_id))}&limit=1`,
        );
        if (variants[0]) {
          const matchedVariant = {
            variant_id: String(variants[0].id),
            product_id: String(variants[0].product_id),
            variant_key: String(variants[0].variant_key),
          };
          if (existingVariant && existingVariant.variant_id !== matchedVariant.variant_id) {
            throw new Error(
              `Candidate ${candidate.id} has conflicting JAN/model identities: ` +
                `${existingVariant.variant_id} vs ${matchedVariant.variant_id}`,
            );
          }
          existingVariant = matchedVariant;
        }
      }
    }
    let productId = existingVariant?.product_id;
    if (!productId) {
      const proposedId = productIdFromCanonicalKey(candidate.canonicalKey);
      const products = await this.upsert(
        'products',
        [productRow(proposedId, candidate)],
        SUPABASE_CONFLICT_TARGETS.products,
        true,
      );
      productId = String(products[0].id);
    }
    await this.patch('products', `id=eq.${encodeURIComponent(productId)}`, {
      normalized_name: candidate.normalizedName,
      base_product_name: candidate.baseProductName,
    });
    const variantKey = existingVariant?.variant_key ?? buildProductVariantKey(productId, candidate, listing, identityKeys);
    const proposedVariantId = existingVariant?.variant_id ?? productVariantId(variantKey);
    const variants = await this.upsert(
      'product_variants',
      [productVariantRow(proposedVariantId, productId, variantKey, candidate)],
      SUPABASE_CONFLICT_TARGETS.productVariants,
      true,
    );
    const variantId = String(variants[0].id);
    if (identityKeys.length > 0) {
      await this.upsert(
        'product_identity_keys',
        identityKeys.map((key) => ({
          variant_id: variantId,
          key_type: key.keyType,
          namespace: key.namespace,
          normalized_value: key.normalizedValue,
          source: key.source,
          confidence: key.confidence,
        })),
        SUPABASE_CONFLICT_TARGETS.productIdentityKeys,
      );
    }
    await this.upsert(
      'product_translations',
      [productTranslationRow(productId, candidate)],
      SUPABASE_CONFLICT_TARGETS.productTranslations,
    );
    const previousLinks = await this.select(
      'product_retailer_listings',
      `select=product_id&candidate_id=eq.${encodeURIComponent(candidate.id)}`,
    );
    await this.delete('product_retailer_listings', `candidate_id=eq.${encodeURIComponent(candidate.id)}`);
    await this.upsert(
      'product_retailer_listings',
      [productListingRow(productId, variantId, candidate, listing)],
      SUPABASE_CONFLICT_TARGETS.productRetailerListings,
    );
    for (const previousLink of previousLinks) {
      const previousProductId = String(previousLink.product_id ?? '');
      if (!previousProductId || previousProductId === productId) continue;
      const remainingLinks = await this.select(
        'product_retailer_listings',
        `select=product_id&product_id=eq.${encodeURIComponent(previousProductId)}&limit=1`,
      );
      if (remainingLinks.length === 0) {
        await this.delete(
          'products',
          `id=eq.${encodeURIComponent(previousProductId)}&status=eq.draft`,
        );
      }
    }
    await this.patch('product_candidates', `id=eq.${encodeURIComponent(candidate.id)}`, { status: 'merged' });
    await this.patch(
      'product_review_queue',
      `candidate_id=eq.${encodeURIComponent(candidate.id)}&issue_type=eq.initial_review_required&status=eq.open`,
      { status: 'resolved', resolution_note: '高信頼候補の明示的なmerge工程で統合済み。' },
    );
    return productId;
  }

  async markSearchCompleted(queryId: string, searchedAt: string): Promise<void> {
    await this.patch('product_search_queries', `id=eq.${encodeURIComponent(queryId)}`, {
      last_searched_at: searchedAt,
    });
  }

  async loadQualitySnapshot(): Promise<CatalogQualitySnapshot> {
    // This command intentionally performs a full consistency scan. Keep the
    // scans sequential and narrow so large importer tables do not compete for
    // statement memory, and use a unique keyset cursor instead of deep offsets.
    const listings = await this.selectAllByKeyset('retailer_listings_raw', 'id', QUALITY_LISTING_COLUMNS);
    const candidates = await this.selectAllByKeyset('product_candidates', 'id', QUALITY_CANDIDATE_COLUMNS);
    const products = await this.selectAllByKeyset('products', 'id', QUALITY_PRODUCT_COLUMNS);
    const variants = await this.selectAllByKeyset('product_variants', 'id', QUALITY_VARIANT_COLUMNS);
    const identityKeys = await this.selectAllByKeyset('product_identity_keys', 'id', QUALITY_IDENTITY_COLUMNS);
    const productListings = await this.selectAllByKeyset(
      'product_retailer_listings',
      'candidate_id',
      QUALITY_PRODUCT_LISTING_COLUMNS,
    );
    const reviewQueue = await this.selectAllByKeyset('product_review_queue', 'id', QUALITY_REVIEW_COLUMNS);
    return { listings, candidates, products, variants, identityKeys, productListings, reviewQueue };
  }

  async loadPetProductMasterSnapshot(
    options: { petGroup?: string } = {},
  ): Promise<CatalogQualitySnapshot> {
    const products: Record<string, unknown>[] = [];
    let lastProductId: string | undefined;
    for (;;) {
      const page = await this.select(
        'products',
        'select=*' +
          (options.petGroup ? `&pet_group=eq.${encodeURIComponent(options.petGroup)}` : '') +
          (lastProductId ? `&id=gt.${encodeURIComponent(lastProductId)}` : '') +
          `&order=id.asc&limit=${SUPABASE_SELECT_PAGE_SIZE}`,
      );
      products.push(...page);
      if (page.length < SUPABASE_SELECT_PAGE_SIZE) break;
      lastProductId = String(page.at(-1)?.id ?? '');
    }
    const productIds = products.map((row) => String(row.id));
    if (productIds.length === 0) return petProductMasterSnapshot([], [], [], [], []);

    const variants = await this.selectRowsByIds(
      'product_variants',
      'product_id',
      productIds,
      '*',
      'id.asc',
    );
    const variantIds = variants.map((row) => String(row.id));
    if (variantIds.length === 0) return petProductMasterSnapshot(products, [], [], [], []);

    const identityKeys = await this.selectRowsByIds(
      'product_identity_keys',
      'variant_id',
      variantIds,
      '*',
      'id.asc',
    );
    const productListings = await this.selectRowsByIds(
      'product_retailer_listings',
      'variant_id',
      variantIds,
      '*',
      'product_id.asc,raw_listing_id.asc',
    );
    const rawListingIds = [...new Set(productListings.map((row) => String(row.raw_listing_id)))];
    const listings = await this.selectRowsByIds(
      'retailer_listings_raw',
      'id',
      rawListingIds,
      'id,source,source_item_id,shop_name,price,currency,item_url,affiliate_url,image_url,availability,fetched_at,market_code',
      'id.asc',
    );
    return petProductMasterSnapshot(products, variants, identityKeys, productListings, listings);
  }

  async loadBlockingReviewSnapshot(
    options: { petGroup?: string; candidateIds?: string[] } = {},
  ): Promise<CatalogQualitySnapshot> {
    const reviewQueue: Record<string, unknown>[] = [];
    const baseFilter =
      'select=id,candidate_id,pet_group,issue_type,issue_detail,source_url,suggested_action,confidence,status,disposition' +
      '&disposition=eq.blocking&status=eq.open' +
      (options.petGroup ? `&pet_group=eq.${encodeURIComponent(options.petGroup)}` : '');
    if (options.candidateIds) {
      for (const candidateIds of chunkSupabaseFilterValues(options.candidateIds)) {
        const encodedIds = candidateIds.map((id) => encodeURIComponent(id)).join(',');
        reviewQueue.push(
          ...(await collectSupabasePages((offset, limit) =>
            this.select(
              'product_review_queue',
              `${baseFilter}&candidate_id=in.(${encodedIds})&order=id.asc&offset=${offset}&limit=${limit}`,
            ),
          )),
        );
      }
    } else {
      let lastId: string | undefined;
      for (;;) {
        const page = await this.select(
          'product_review_queue',
          `${baseFilter}${lastId ? `&id=gt.${encodeURIComponent(lastId)}` : ''}` +
            `&order=id.asc&limit=${SUPABASE_SELECT_PAGE_SIZE}`,
        );
        reviewQueue.push(...page);
        if (page.length < SUPABASE_SELECT_PAGE_SIZE) break;
        lastId = String(page.at(-1)?.id ?? '');
      }
    }
    const candidateIds = [...new Set(reviewQueue.map((row) => String(row.candidate_id)))];
    const candidates = await this.selectRowsByIds(
      'product_candidates',
      'id',
      candidateIds,
      'id,raw_listing_id,normalized_name,brand,pet_group,target_species,target_scope,category_id,subcategory_id,confidence,jan_code,model_number',
    );
    const rawListingIds = [...new Set(candidates.map((row) => String(row.raw_listing_id)))];
    const listings = await this.selectRowsByIds(
      'retailer_listings_raw',
      'id',
      rawListingIds,
      'id,source,raw_title,item_url,image_url,jan_code,model_number',
    );
    return blockingReviewSnapshot(reviewQueue, candidates, listings);
  }

  async reviewBlockingCandidate(input: BlockingReviewDecisionInput): Promise<void> {
    await this.request('rpc/review_pet_catalog_candidate', {
      method: 'POST',
      body: JSON.stringify({
        p_candidate_id: input.candidateId,
        p_decision: input.decision,
        p_reviewer: input.reviewer,
        p_resolution_note: input.resolutionNote ?? null,
        p_expected_issue_types: input.expectedIssueTypes,
      }),
    });
  }

  async resolveCanonicalKeyMatches(candidateIds: string[]): Promise<number> {
    let resolvedCount = 0;
    for (let offset = 0; offset < candidateIds.length; offset += SUPABASE_RPC_BATCH_SIZE) {
      const response = await this.request('rpc/resolve_pet_catalog_exact_name_brand_matches', {
        method: 'POST',
        body: JSON.stringify({ p_candidate_ids: candidateIds.slice(offset, offset + SUPABASE_RPC_BATCH_SIZE) }),
      });
      resolvedCount += Number(await response.json());
    }
    return resolvedCount;
  }

  async upsertPetProductMasters(rows: PetProductMaster[], concurrency = 4): Promise<void> {
    const batchSize = 100;
    const batches: PetProductMaster[][] = [];
    for (let offset = 0; offset < rows.length; offset += batchSize) {
      batches.push(rows.slice(offset, offset + batchSize));
    }
    await forEachWithConcurrency(batches, concurrency, async (batch) => {
      await this.upsert(
        'pet_product_masters',
        batch.map(petProductMasterRow),
        SUPABASE_CONFLICT_TARGETS.petProductMasters,
      );
    });
  }

  async close(): Promise<void> {}

  private async upsert(
    table: string,
    rows: Record<string, unknown>[],
    onConflict: string,
    returnRows = false,
  ): Promise<Record<string, unknown>[]> {
    const response = await this.request(`${table}?on_conflict=${encodeURIComponent(onConflict)}`, {
      method: 'POST',
      headers: {
        Prefer: `resolution=merge-duplicates${returnRows ? ',return=representation' : ',return=minimal'}`,
      },
      body: JSON.stringify(rows),
    });
    return returnRows ? ((await response.json()) as Record<string, unknown>[]) : [];
  }

  private async patch(table: string, filter: string, body: Record<string, unknown>): Promise<void> {
    await this.request(`${table}?${filter}`, { method: 'PATCH', body: JSON.stringify(body) });
  }

  private async selectAllByKeyset(
    table: string,
    cursorColumn: string,
    columns: string,
  ): Promise<Record<string, unknown>[]> {
    const rows: Record<string, unknown>[] = [];
    let lastCursor: string | undefined;
    for (;;) {
      const page = await this.select(
        table,
        `select=${columns}` +
          (lastCursor ? `&${cursorColumn}=gt.${encodeURIComponent(lastCursor)}` : '') +
          `&order=${cursorColumn}.asc&limit=${SUPABASE_SELECT_PAGE_SIZE}`,
      );
      rows.push(...page);
      if (page.length < SUPABASE_SELECT_PAGE_SIZE) return rows;
      const nextCursor = String(page.at(-1)?.[cursorColumn] ?? '');
      if (!nextCursor || nextCursor === lastCursor) {
        throw new Error(`[pet-catalog:repository] Invalid ${table}.${cursorColumn} keyset cursor.`);
      }
      lastCursor = nextCursor;
    }
  }

  private async selectRowsByIds(
    table: string,
    idColumn: string,
    ids: string[],
    columns: string,
    order = `${idColumn}.asc`,
  ): Promise<Record<string, unknown>[]> {
    const rows: Record<string, unknown>[] = [];
    for (const idBatch of chunkSupabaseFilterValues(ids)) {
      const encodedIds = idBatch.map((id) => encodeURIComponent(id)).join(',');
      rows.push(
        ...(await collectSupabasePages((offset, limit) =>
          this.select(
            table,
            `select=${columns}&${idColumn}=in.(${encodedIds})&order=${order}&offset=${offset}&limit=${limit}`,
          ),
        )),
      );
    }
    return rows;
  }

  private async select(table: string, query: string): Promise<Record<string, unknown>[]> {
    const response = await this.request(`${table}?${query}`, {});
    return (await response.json()) as Record<string, unknown>[];
  }

  private async delete(table: string, filter: string): Promise<void> {
    await this.request(`${table}?${filter}`, { method: 'DELETE' });
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    const key = config.supabaseServiceRoleKey ?? '';
    const method = init.method ?? 'GET';
    let response: Response;
    try {
      response = await fetchWithSupabaseRetry(
        `${config.supabaseUrl}/rest/v1/${path}`,
        {
          ...init,
          headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
            ...(init.headers ?? {}),
          },
        },
        {
          maxRetries: config.supabaseRequestMaxRetries,
          baseDelayMs: config.supabaseRequestRetryBaseMs,
          onRetry: ({ attempt, maxRetries, delayMs, reason }) => {
            console.warn(
              `[pet-catalog:repository] ${method} ${path} retry=${attempt}/${maxRetries} ` +
                `delay=${delayMs}ms reason=${reason}`,
            );
          },
        },
      );
    } catch (error) {
      throw new Error(
        `[pet-catalog:repository] ${method} ${path} failed after ` +
          `${config.supabaseRequestMaxRetries + 1} attempts: ${describeFetchError(error)}`,
        { cause: error },
      );
    }
    if (!response.ok) {
      throw new Error(`[pet-catalog:repository] ${method} ${path} failed ${response.status}: ${await response.text()}`);
    }
    return response;
  }
}

function retryDelayMs(retryAfter: string | null | undefined, baseDelayMs: number, attempt: number): number {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 60_000);
    const retryAt = Date.parse(retryAfter);
    if (Number.isFinite(retryAt)) return Math.min(Math.max(0, retryAt - Date.now()), 60_000);
  }
  return Math.min(baseDelayMs * 2 ** attempt, 10_000);
}

async function retryableSupabaseResponseReason(response: Response): Promise<string | undefined> {
  if (SUPABASE_RETRYABLE_STATUS_CODES.has(response.status)) return `HTTP ${response.status}`;
  if (response.status !== 401) return undefined;
  try {
    const body = await response.clone().text();
    if (/JWT issued at future/i.test(body)) return 'HTTP 401 JWT issued at future';
  } catch {
    // Preserve the original response when its body cannot be cloned/read.
  }
  return undefined;
}

function isRetryableFetchError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return false;
  if (error instanceof TypeError && /fetch failed/i.test(error.message)) return true;
  const code = errorCode(error);
  return code ? SUPABASE_RETRYABLE_ERROR_CODES.has(code) : false;
}

function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const value = error as { code?: unknown; cause?: unknown };
  if (typeof value.code === 'string') return value.code;
  return errorCode(value.cause);
}

function describeFetchError(error: unknown): string {
  const code = errorCode(error);
  const message = error instanceof Error ? error.message : String(error);
  return code ? `${message} (${code})` : message;
}

function searchQueryValues(query: ProductSearchQuery): unknown[] {
  return [
    query.id,
    query.petGroup,
    query.targetSpecies ?? null,
    query.targetSpeciesGroup ?? null,
    query.categoryId,
    query.subcategoryId,
    query.keyword,
    query.negativeKeywords,
    query.rakutenGenreId ?? null,
    query.yahooGenreCategoryId ?? null,
    query.yahooBrandId ?? null,
    query.priority,
    query.enabled,
    query.maxPages,
    query.locale,
    query.marketCode,
    query.currencyCode,
    query.lastSearchedAt ?? null,
  ];
}

function rawListingValues(listing: RetailerListingInput): unknown[] {
  const row = rawListingRow(listing);
  return [
    row.source,
    row.source_item_id,
    row.search_query_id,
    row.search_pet_group,
    row.search_target_species,
    row.content_locale,
    row.market_code,
    row.raw_title,
    row.raw_description,
    row.shop_name,
    row.brand_name,
    row.maker_name,
    row.price,
    row.currency,
    row.item_url,
    row.affiliate_url,
    row.image_url,
    row.jan_code,
    row.model_number,
    row.genre_id,
    row.genre_name,
    row.availability,
    row.fetched_at,
    JSON.stringify(row.raw_json),
  ];
}

function candidateValues(candidate: ProductCandidate): unknown[] {
  const row = candidateRow(candidate);
  return [
    row.id,
    row.raw_listing_id,
    row.source_locale,
    row.normalized_name,
    row.brand,
    row.series,
    row.base_product_name,
    row.pet_group,
    row.target_species,
    row.target_species_group,
    row.target_scope,
    row.target_size,
    row.target_age,
    row.life_stage,
    row.habitat_type,
    row.feeding_type,
    row.flavor,
    row.primary_ingredient,
    row.purpose,
    row.product_function,
    row.package_type,
    row.category_id,
    row.subcategory_id,
    row.capacity_value,
    row.capacity_unit,
    row.quantity,
    row.jan_code,
    row.model_number,
    row.canonical_key,
    JSON.stringify(row.classification_evidence),
    row.classification_confidence,
    row.merge_confidence,
    row.confidence,
    row.status,
  ];
}

function reviewValues(candidate: ProductCandidate, listing: StoredRetailerListing, issue: ReviewIssue): unknown[] {
  const row = reviewRow(candidate, listing, issue);
  return [
    row.candidate_id,
    row.raw_listing_id,
    row.pet_group,
    row.detected_target_species,
    row.issue_type,
    row.issue_detail,
    row.source_url,
    row.suggested_action,
    row.confidence,
    row.disposition,
    row.policy_reason,
    row.status,
    row.checked_at,
    row.checked_by,
    row.resolution_note,
  ];
}

function productValues(id: string, candidate: ProductCandidate): unknown[] {
  const row = productRow(id, candidate);
  return [
    row.id,
    row.canonical_key,
    row.source_locale,
    row.normalized_name,
    row.brand,
    row.series,
    row.base_product_name,
    row.pet_group,
    row.target_species,
    row.target_species_group,
    row.target_scope,
    row.target_size,
    row.target_age,
    row.life_stage,
    row.habitat_type,
    row.feeding_type,
    row.flavor,
    row.primary_ingredient,
    row.purpose,
    row.product_function,
    row.package_type,
    row.category_id,
    row.subcategory_id,
    row.confidence,
  ];
}

function productTranslationValues(productId: string, candidate: ProductCandidate): unknown[] {
  const row = productTranslationRow(productId, candidate);
  return [row.product_id, row.locale, row.display_name, row.normalized_name, row.base_product_name];
}

function productListingValues(
  productId: string,
  variantId: string,
  candidate: ProductCandidate,
  listing: StoredRetailerListing,
): unknown[] {
  const row = productListingRow(productId, variantId, candidate, listing);
  return [
    row.product_id,
    row.variant_id,
    row.raw_listing_id,
    row.candidate_id,
    row.capacity_value,
    row.capacity_unit,
    row.quantity,
    row.jan_code,
    row.model_number,
    row.price,
    row.item_url,
    row.affiliate_url,
    row.availability,
  ];
}

function searchQueryRow(query: ProductSearchQuery): Record<string, unknown> {
  return {
    id: query.id,
    pet_group: query.petGroup,
    target_species: query.targetSpecies ?? null,
    target_species_group: query.targetSpeciesGroup ?? null,
    category_id: query.categoryId,
    subcategory_id: query.subcategoryId,
    keyword: query.keyword,
    negative_keywords: query.negativeKeywords,
    rakuten_genre_id: query.rakutenGenreId ?? null,
    yahoo_genre_category_id: query.yahooGenreCategoryId ?? null,
    yahoo_brand_id: query.yahooBrandId ?? null,
    priority: query.priority,
    enabled: query.enabled,
    max_pages: query.maxPages,
    locale: query.locale,
    market_code: query.marketCode,
    currency_code: query.currencyCode,
    last_searched_at: query.lastSearchedAt ?? null,
  };
}

function rawListingRow(listing: RetailerListingInput): Record<string, unknown> {
  return {
    source: listing.source,
    source_item_id: listing.sourceItemId,
    search_query_id: listing.searchQueryId,
    search_pet_group: listing.searchPetGroup,
    search_target_species: listing.searchTargetSpecies ?? null,
    content_locale: listing.contentLocale,
    market_code: listing.marketCode,
    raw_title: listing.rawTitle,
    raw_description: listing.rawDescription ?? null,
    shop_name: listing.shopName ?? null,
    brand_name: listing.brandName ?? null,
    maker_name: listing.makerName ?? null,
    price: listing.price ?? null,
    currency: listing.currencyCode,
    item_url: listing.itemUrl ?? null,
    affiliate_url: listing.affiliateUrl ?? null,
    image_url: listing.imageUrl ?? null,
    jan_code: listing.janCode ?? null,
    model_number: listing.modelNumber ?? null,
    genre_id: listing.genreId ?? null,
    genre_name: listing.genreName ?? null,
    availability: listing.availability ?? null,
    fetched_at: listing.fetchedAt,
    raw_json: listing.rawJson,
  };
}

function storedListingFromRow(row: Record<string, unknown>): StoredRetailerListing {
  return {
    id: String(row.id),
    source: String(row.source) as StoredRetailerListing['source'],
    sourceItemId: String(row.source_item_id),
    searchQueryId: String(row.search_query_id),
    searchPetGroup: String(row.search_pet_group) as StoredRetailerListing['searchPetGroup'],
    searchTargetSpecies: optionalString(row.search_target_species),
    contentLocale: optionalString(row.content_locale) ?? 'ja-JP',
    marketCode: optionalString(row.market_code) ?? 'JP',
    currencyCode: optionalString(row.currency) ?? 'JPY',
    rawTitle: String(row.raw_title),
    rawDescription: optionalString(row.raw_description),
    shopName: optionalString(row.shop_name),
    brandName: optionalString(row.brand_name),
    makerName: optionalString(row.maker_name),
    price: optionalNumber(row.price),
    itemUrl: optionalString(row.item_url),
    affiliateUrl: optionalString(row.affiliate_url),
    imageUrl: optionalString(row.image_url),
    janCode: optionalString(row.jan_code),
    modelNumber: optionalString(row.model_number),
    genreId: optionalString(row.genre_id),
    genreName: optionalString(row.genre_name),
    availability: typeof row.availability === 'boolean' ? row.availability : undefined,
    fetchedAt: row.fetched_at instanceof Date ? row.fetched_at.toISOString() : String(row.fetched_at),
    rawJson: row.raw_json,
  };
}

function candidateFromRow(row: Record<string, unknown>): ProductCandidate {
  const evidence = row.classification_evidence;
  return {
    id: String(row.id),
    rawListingId: String(row.raw_listing_id),
    sourceLocale: optionalString(row.source_locale) ?? 'ja-JP',
    normalizedName: String(row.normalized_name),
    brand: optionalString(row.brand),
    series: optionalString(row.series),
    baseProductName: String(row.base_product_name),
    petGroup: optionalString(row.pet_group) as ProductCandidate['petGroup'],
    targetSpecies: stringArray(row.target_species),
    targetSpeciesGroup: optionalString(row.target_species_group),
    targetScope: String(row.target_scope) as ProductCandidate['targetScope'],
    targetSize: optionalString(row.target_size),
    targetAge: optionalString(row.target_age),
    lifeStage: optionalString(row.life_stage) as ProductCandidate['lifeStage'],
    habitatType: optionalString(row.habitat_type) as ProductCandidate['habitatType'],
    feedingType: optionalString(row.feeding_type) as ProductCandidate['feedingType'],
    flavor: optionalString(row.flavor),
    primaryIngredient: optionalString(row.primary_ingredient),
    purpose: optionalString(row.purpose),
    productFunction: optionalString(row.product_function),
    packageType: optionalString(row.package_type) as ProductCandidate['packageType'],
    categoryId: optionalString(row.category_id),
    subcategoryId: optionalString(row.subcategory_id),
    capacityValue: optionalNumber(row.capacity_value),
    capacityUnit: optionalString(row.capacity_unit),
    quantity: optionalNumber(row.quantity),
    janCode: optionalString(row.jan_code),
    modelNumber: optionalString(row.model_number),
    canonicalKey: String(row.canonical_key),
    classificationEvidence:
      evidence && typeof evidence === 'object' && !Array.isArray(evidence)
        ? evidence as ProductCandidate['classificationEvidence']
        : { petGroup: [], targetSpecies: [], targetSpeciesGroup: [], searchContext: { queryId: '', petGroup: 'cat' }, notes: [] },
    classificationConfidence: optionalNumber(row.classification_confidence) ?? 0,
    mergeConfidence: optionalNumber(row.merge_confidence) ?? 0,
    confidence: optionalNumber(row.confidence) ?? 0,
    status: String(row.status) as ProductCandidate['status'],
    issues: [],
  };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function candidateRow(candidate: ProductCandidate): Record<string, unknown> {
  return {
    id: candidate.id,
    raw_listing_id: candidate.rawListingId,
    source_locale: candidate.sourceLocale,
    normalized_name: candidate.normalizedName,
    brand: candidate.brand ?? null,
    series: candidate.series ?? null,
    base_product_name: candidate.baseProductName,
    pet_group: candidate.petGroup ?? null,
    target_species: candidate.targetSpecies,
    target_species_group: candidate.targetSpeciesGroup ?? null,
    target_scope: candidate.targetScope,
    target_size: candidate.targetSize ?? null,
    target_age: candidate.targetAge ?? null,
    life_stage: candidate.lifeStage ?? null,
    habitat_type: candidate.habitatType ?? null,
    feeding_type: candidate.feedingType ?? null,
    flavor: candidate.flavor ?? null,
    primary_ingredient: candidate.primaryIngredient ?? null,
    purpose: candidate.purpose ?? null,
    product_function: candidate.productFunction ?? null,
    package_type: candidate.packageType ?? null,
    category_id: candidate.categoryId ?? null,
    subcategory_id: candidate.subcategoryId ?? null,
    capacity_value: candidate.capacityValue ?? null,
    capacity_unit: candidate.capacityUnit ?? null,
    quantity: candidate.quantity ?? null,
    jan_code: candidate.janCode ?? null,
    model_number: candidate.modelNumber ?? null,
    canonical_key: candidate.canonicalKey,
    classification_evidence: candidate.classificationEvidence,
    classification_confidence: candidate.classificationConfidence,
    merge_confidence: candidate.mergeConfidence,
    confidence: candidate.confidence,
    status: candidate.status,
  };
}

function reviewRow(
  candidate: ProductCandidate,
  listing: StoredRetailerListing,
  issue: ReviewIssue,
): Record<string, unknown> {
  const disposition = issue.disposition ?? 'blocking';
  const candidateRejected = candidate.status === 'rejected';
  const resolved = candidateRejected || disposition !== 'blocking';
  const resolutionNote = candidateRejected && disposition !== 'reject'
    ? '同一candidateに自動reject issueがあるため、このissueもレビュー対象から除外。'
    : issue.policyReason ?? 'issue disposition policyによる自動判定。';
  return {
    candidate_id: candidate.id,
    raw_listing_id: listing.id,
    pet_group: candidate.petGroup ?? null,
    detected_target_species: candidate.targetSpecies,
    issue_type: issue.issueType,
    issue_detail: issue.issueDetail,
    source_url: listing.itemUrl ?? null,
    suggested_action: issue.suggestedAction,
    confidence: candidate.confidence,
    disposition,
    policy_reason: issue.policyReason ?? '未分類issueのためblockingとして扱う。',
    status: candidateRejected || disposition === 'reject' ? 'rejected' : resolved ? 'resolved' : 'open',
    checked_at: resolved ? new Date().toISOString() : null,
    checked_by: resolved ? 'issue-policy-v2' : null,
    resolution_note: resolved ? resolutionNote : null,
  };
}

function petProductMasterRow(master: PetProductMaster): Record<string, unknown> {
  return {
    id: master.id,
    product_id: master.productId,
    variant_id: master.variantId,
    pet_group: master.petGroup,
    target_species: master.targetSpecies,
    target_scope: master.targetScope,
    category_id: master.categoryId,
    subcategory_id: master.subcategoryId,
    normalized_name: master.normalizedName,
    brand: master.brand ?? null,
    jan_code: master.janCode ?? null,
    status: master.status,
    source_locale: master.sourceLocale,
    data: master,
    published_at: master.status === 'published' ? master.updatedAt : null,
  };
}

function petProductMasterValues(master: PetProductMaster): unknown[] {
  const row = petProductMasterRow(master);
  return [
    row.id,
    row.product_id,
    row.variant_id,
    row.pet_group,
    row.target_species,
    row.target_scope,
    row.category_id,
    row.subcategory_id,
    row.normalized_name,
    row.brand,
    row.jan_code,
    row.status,
    row.source_locale,
    JSON.stringify(row.data),
  ];
}

function productRow(id: string, candidate: ProductCandidate): Record<string, unknown> {
  const product: CatalogProduct = {
    id,
    sourceLocale: candidate.sourceLocale,
    normalizedName: candidate.normalizedName,
    brand: candidate.brand,
    series: candidate.series,
    baseProductName: candidate.baseProductName,
    petGroup: candidate.petGroup as NonNullable<ProductCandidate['petGroup']>,
    targetSpecies: candidate.targetSpecies,
    targetSpeciesGroup: candidate.targetSpeciesGroup,
    targetScope: candidate.targetScope,
    targetSize: candidate.targetSize,
    targetAge: candidate.targetAge,
    lifeStage: candidate.lifeStage,
    habitatType: candidate.habitatType,
    feedingType: candidate.feedingType,
    flavor: candidate.flavor,
    primaryIngredient: candidate.primaryIngredient,
    purpose: candidate.purpose,
    productFunction: candidate.productFunction,
    packageType: candidate.packageType,
    categoryId: candidate.categoryId,
    subcategoryId: candidate.subcategoryId,
    canonicalKey: candidate.canonicalKey,
    confidence: candidate.confidence,
    status: 'draft',
  };
  return {
    id: product.id,
    canonical_key: product.canonicalKey,
    source_locale: product.sourceLocale,
    normalized_name: product.normalizedName,
    brand: product.brand ?? null,
    series: product.series ?? null,
    base_product_name: product.baseProductName,
    pet_group: product.petGroup,
    target_species: product.targetSpecies,
    target_species_group: product.targetSpeciesGroup ?? null,
    target_scope: product.targetScope,
    target_size: product.targetSize ?? null,
    target_age: product.targetAge ?? null,
    life_stage: product.lifeStage ?? null,
    habitat_type: product.habitatType ?? null,
    feeding_type: product.feedingType ?? null,
    flavor: product.flavor ?? null,
    primary_ingredient: product.primaryIngredient ?? null,
    purpose: product.purpose ?? null,
    product_function: product.productFunction ?? null,
    package_type: product.packageType ?? null,
    category_id: product.categoryId ?? null,
    subcategory_id: product.subcategoryId ?? null,
    confidence: product.confidence,
    status: product.status,
  };
}

function productTranslationRow(productId: string, candidate: ProductCandidate): Record<string, unknown> {
  return {
    product_id: productId,
    locale: candidate.sourceLocale,
    display_name: candidate.baseProductName,
    normalized_name: candidate.normalizedName,
    base_product_name: candidate.baseProductName,
    description: null,
    source: 'pipeline',
    status: 'draft',
  };
}

function localizedRows(
  identity: Record<string, unknown>,
  nameJa: string,
  nameEn?: string,
): Record<string, unknown>[] {
  return [
    { ...identity, locale: 'ja-JP', name: nameJa, source: 'seed', status: 'approved' },
    ...(nameEn ? [{ ...identity, locale: 'en', name: nameEn, source: 'seed', status: 'approved' }] : []),
  ];
}

function productListingRow(
  productId: string,
  variantId: string,
  candidate: ProductCandidate,
  listing: StoredRetailerListing,
): Record<string, unknown> {
  return {
    product_id: productId,
    variant_id: variantId,
    raw_listing_id: listing.id,
    candidate_id: candidate.id,
    capacity_value: candidate.capacityValue ?? null,
    capacity_unit: candidate.capacityUnit ?? null,
    quantity: candidate.quantity ?? null,
    jan_code: candidate.janCode ?? null,
    model_number: candidate.modelNumber ?? null,
    price: listing.price ?? null,
    item_url: listing.itemUrl ?? null,
    affiliate_url: listing.affiliateUrl ?? null,
    availability: listing.availability ?? null,
  };
}

type ProductIdentityKeyInput = {
  keyType: 'jan' | 'model_number';
  namespace: string;
  normalizedValue: string;
  source: string;
  confidence: number;
};

type ExistingVariantIdentity = {
  variant_id: string;
  product_id: string;
  variant_key: string;
};

export function buildProductIdentityKeys(
  candidate: ProductCandidate,
  listing: StoredRetailerListing,
): ProductIdentityKeyInput[] {
  const keys: ProductIdentityKeyInput[] = [];
  const jan = (candidate.janCode ?? listing.janCode)?.replace(/\D/g, '');
  const validJan = jan && /^\d{8,14}$/.test(jan) ? jan : undefined;
  if (validJan) {
    keys.push({ keyType: 'jan', namespace: '', normalizedValue: validJan, source: listing.source, confidence: 1 });
  }
  const model = normalizeModelNumber(candidate.modelNumber ?? listing.modelNumber);
  const namespace = normalizeIdentityNamespace(candidate.brand ?? listing.brandName ?? listing.makerName);
  // Retailer feeds sometimes expose a series-level model number shared by
  // multiple capacity variants. A valid JAN is SKU-specific, so do not also
  // register the model number as a competing strong identity in that case.
  if (!validJan && model && namespace) {
    keys.push({
      keyType: 'model_number',
      namespace,
      normalizedValue: model,
      source: listing.source,
      confidence: 0.98,
    });
  }
  return keys;
}

export function buildProductVariantKey(
  productId: string,
  candidate: ProductCandidate,
  listing: StoredRetailerListing,
  identityKeys: ProductIdentityKeyInput[],
): string {
  const strongest = identityKeys[0];
  if (strongest) return `identity:${strongest.keyType}:${strongest.namespace}:${strongest.normalizedValue}`;
  const attributes = [
    candidate.capacityValue ?? '',
    candidate.capacityUnit ?? '',
    candidate.quantity ?? '',
    candidate.packageType ?? '',
  ].join(':');
  if (attributes.replace(/:/g, '')) return `attributes:${productId}:${attributes}`;
  return `default:${productId}:${listing.source}:${listing.sourceItemId}`;
}

function productVariantId(variantKey: string): string {
  return `variant-${createHash('sha256').update(variantKey).digest('hex').slice(0, 24)}`;
}

function productVariantValues(
  id: string,
  productId: string,
  variantKey: string,
  candidate: ProductCandidate,
): unknown[] {
  const row = productVariantRow(id, productId, variantKey, candidate);
  return [
    row.id,
    row.product_id,
    row.variant_key,
    row.capacity_value,
    row.capacity_unit,
    row.quantity,
    row.jan_code,
    row.model_number,
    row.package_type,
  ];
}

function productVariantRow(
  id: string,
  productId: string,
  variantKey: string,
  candidate: ProductCandidate,
): Record<string, unknown> {
  return {
    id,
    product_id: productId,
    variant_key: variantKey,
    capacity_value: candidate.capacityValue ?? null,
    capacity_unit: candidate.capacityUnit ?? null,
    quantity: candidate.quantity ?? null,
    jan_code: candidate.janCode ?? null,
    model_number: candidate.modelNumber ?? null,
    package_type: candidate.packageType ?? null,
    status: 'active',
  };
}

function normalizeModelNumber(value: string | undefined): string | undefined {
  const normalized = value
    ?.normalize('NFKC')
    .toLowerCase()
    .replace(/[‐‑‒–—―ー－]/g, '-')
    .replace(/\s+/g, '')
    .trim();
  return normalized || undefined;
}

function normalizeIdentityNamespace(value: string | undefined): string {
  return value
    ?.normalize('NFKC')
    .toLowerCase()
    .replace(/[\s　\-_/・,，.。()（）[\]【】'"“”]/g, '') ?? '';
}

function productIdFromCanonicalKey(canonicalKey: string): string {
  return `product-${createHash('sha256').update(canonicalKey).digest('hex').slice(0, 24)}`;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

type PgResult<T extends Record<string, unknown> = Record<string, unknown>> = { rows: T[] };
type PgClient = {
  connect(): Promise<void>;
  query<T extends Record<string, unknown> = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<PgResult<T>>;
  end(): Promise<void>;
};

export type CatalogBrandRow = {
  id: string;
  nameJa: string;
  nameEn?: string;
  manufacturer?: string;
  normalizedName: string;
};

export type CatalogCategoryRow = {
  id: string;
  nameJa: string;
  nameEn: string;
  sortOrder: number;
  enabled: boolean;
};

export type CatalogSubcategoryRow = {
  id: string;
  categoryId: string;
  nameJa: string;
  nameEn: string;
  sortOrder: number;
  enabled: boolean;
};
