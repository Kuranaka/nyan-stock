export const PET_GROUPS = [
  'cat',
  'dog',
  'rabbit',
  'small_animal',
  'bird',
  'aquarium',
  'reptile_amphibian',
  'insect',
] as const;

export type PetGroup = (typeof PET_GROUPS)[number];

export const TARGET_SCOPES = ['species_specific', 'multi_species', 'group_wide', 'unconfirmed'] as const;
export type TargetScope = (typeof TARGET_SCOPES)[number];

export const HABITAT_TYPES = ['freshwater', 'marine', 'brackish', 'both', 'not_applicable'] as const;
export type HabitatType = (typeof HABITAT_TYPES)[number];

export const FEEDING_TYPES = [
  'herbivore',
  'carnivore',
  'omnivore',
  'insectivore',
  'species_specific',
  'not_applicable',
] as const;
export type FeedingType = (typeof FEEDING_TYPES)[number];

export const LIFE_STAGES = ['egg', 'larva', 'pupa', 'juvenile', 'adult', 'all_stages', 'not_applicable'] as const;
export type LifeStage = (typeof LIFE_STAGES)[number];

export const RETAILER_SOURCES = ['rakuten_ichiba', 'rakuten_product_navi', 'yahoo_shopping'] as const;
export type RetailerSource = (typeof RETAILER_SOURCES)[number];

export const DEFAULT_CATALOG_LOCALE = 'ja-JP';
export const DEFAULT_CATALOG_MARKET = 'JP';
export const DEFAULT_CATALOG_CURRENCY = 'JPY';

export type ProductSearchQuery = {
  id: string;
  petGroup: PetGroup;
  targetSpecies?: string;
  targetSpeciesGroup?: string;
  categoryId: string;
  subcategoryId: string;
  keyword: string;
  negativeKeywords: string[];
  rakutenGenreId?: string;
  yahooGenreCategoryId?: string;
  yahooBrandId?: string;
  priority: number;
  enabled: boolean;
  maxPages: number;
  locale: string;
  marketCode: string;
  currencyCode: string;
  lastSearchedAt?: string;
};

export type RetailerListingInput = {
  source: RetailerSource;
  sourceItemId: string;
  searchQueryId: string;
  searchPetGroup: PetGroup;
  searchTargetSpecies?: string;
  contentLocale: string;
  marketCode: string;
  currencyCode: string;
  rawTitle: string;
  rawDescription?: string;
  shopName?: string;
  brandName?: string;
  makerName?: string;
  price?: number;
  itemUrl?: string;
  affiliateUrl?: string;
  imageUrl?: string;
  janCode?: string;
  modelNumber?: string;
  genreId?: string;
  genreName?: string;
  availability?: boolean;
  fetchedAt: string;
  rawJson: unknown;
};

export type StoredRetailerListing = RetailerListingInput & {
  id: string;
};

export type ClassificationEvidence = {
  petGroup: Array<{ value: PetGroup; source: 'title' | 'description' | 'api_category'; matched: string }>;
  targetSpecies: Array<{ value: string; source: 'title' | 'description'; matched: string }>;
  targetSpeciesGroup: Array<{ value: string; source: 'title' | 'description'; matched: string }>;
  searchContext: {
    queryId: string;
    petGroup: PetGroup;
    targetSpecies?: string;
  };
  notes: string[];
};

export type CandidateStatus = 'normalized' | 'review_required' | 'merge_ready' | 'merged' | 'rejected';

export type ProductCandidate = {
  id: string;
  rawListingId: string;
  sourceLocale: string;
  normalizedName: string;
  brand?: string;
  series?: string;
  baseProductName: string;
  petGroup?: PetGroup;
  targetSpecies: string[];
  targetSpeciesGroup?: string;
  targetScope: TargetScope;
  targetSize?: string;
  targetAge?: string;
  lifeStage?: LifeStage;
  habitatType?: HabitatType;
  feedingType?: FeedingType;
  flavor?: string;
  primaryIngredient?: string;
  purpose?: string;
  productFunction?: string;
  packageType?: 'main' | 'refill';
  categoryId?: string;
  subcategoryId?: string;
  capacityValue?: number;
  capacityUnit?: string;
  quantity?: number;
  janCode?: string;
  modelNumber?: string;
  canonicalKey: string;
  classificationEvidence: ClassificationEvidence;
  classificationConfidence: number;
  mergeConfidence: number;
  confidence: number;
  status: CandidateStatus;
  issues: ReviewIssue[];
};

export type ReviewIssueType =
  | 'target_species_unknown'
  | 'small_animal_scope_unclear'
  | 'multiple_pet_groups_detected'
  | 'rabbit_or_small_animal_unclear'
  | 'bird_species_unknown'
  | 'freshwater_or_marine_unknown'
  | 'life_stage_unknown'
  | 'feeding_type_unknown'
  | 'possible_wrong_search_result'
  | 'possible_duplicate'
  | 'variant_merge_uncertain'
  | 'package_data_suspicious'
  | 'initial_review_required';

export type ReviewIssueDisposition = 'blocking' | 'non_blocking' | 'reject';

export type NormalizationAliasType = 'species' | 'brand' | 'series';

export type NormalizationAlias = {
  id: string;
  aliasType: NormalizationAliasType;
  locale: string;
  alias: string;
  normalizedAlias: string;
  canonicalValue: string;
  contextValue?: string;
  displayValue?: string;
  priority: number;
  enabled: boolean;
};

export type ReviewIssue = {
  issueType: ReviewIssueType;
  issueDetail: string;
  suggestedAction: string;
  disposition?: ReviewIssueDisposition;
  policyReason?: string;
};

export type CatalogProduct = Omit<
  ProductCandidate,
  | 'id'
  | 'rawListingId'
  | 'capacityValue'
  | 'capacityUnit'
  | 'quantity'
  | 'janCode'
  | 'modelNumber'
  | 'classificationEvidence'
  | 'classificationConfidence'
  | 'mergeConfidence'
  | 'status'
  | 'issues'
> & {
  id: string;
  status: 'draft' | 'approved' | 'active' | 'rejected';
};

export type PetGroupSeed = {
  code: PetGroup;
  nameJa: string;
  nameEn: string;
  sortOrder: number;
};

export type PetSpeciesSeed = {
  code: string;
  petGroup: PetGroup;
  parentSpeciesCode?: string;
  nameJa: string;
  nameEn: string;
  sortOrder: number;
  enabled: boolean;
};

export type PetSpeciesGroupSeed = {
  code: string;
  petGroup: PetGroup;
  nameJa: string;
  nameEn: string;
  sortOrder: number;
  enabled: boolean;
};

export type QualityRow = Record<string, unknown>;

export type CatalogQualitySnapshot = {
  listings: QualityRow[];
  candidates: QualityRow[];
  products: QualityRow[];
  variants: QualityRow[];
  identityKeys: QualityRow[];
  productListings: QualityRow[];
  reviewQueue: QualityRow[];
};

export type QualityFinding = {
  check: string;
  severity: 'error' | 'warning';
  ids: string[];
  detail: string;
};
