export type ProductProvider = 'rakuten' | 'yahoo' | 'amazon' | 'gs1';

export type ProductCategory =
  | 'dry_food'
  | 'wet_food'
  | 'treat'
  | 'cat_litter'
  | 'toilet_sheet'
  | 'supplement'
  | 'medicine'
  | 'care'
  | 'other';

export type ProductUnit = 'g' | 'kg' | 'ml' | 'L' | 'piece' | 'bag';

export type RawProduct = {
  provider: ProductProvider;
  externalId: string;
  rawName: string;
  brand?: string;
  categoryText?: string;
  price?: number;
  imageUrl?: string;
  url?: string;
  janCode?: string;
  amount?: number;
  unit?: ProductUnit;
  shopName?: string;
  fetchedAt: string;
  raw: unknown;
};

export type ProductExternalSource = {
  provider: ProductProvider;
  externalId?: string;
  janCode?: string;
  gtin?: string;
  url?: string;
  imageUrl?: string;
  rawName?: string;
  fetchedAt: string;
};

export type ProductMaster = {
  id: string;
  name: string;
  normalizedName: string;
  brand?: string;
  maker?: string;
  category: ProductCategory;
  description?: string;

  amount?: number;
  unit?: ProductUnit;

  janCode?: string;
  gtin?: string;
  asin?: string;
  rakutenItemCode?: string;
  yahooItemCode?: string;

  imageUrl?: string;
  packageImageUrls?: string[];

  purchaseLinks?: {
    amazon?: string;
    rakuten?: string;
    yahoo?: string;
    official?: string;
  };

  searchKeywords: string[];
  sources: ProductExternalSource[];

  confidence: number;
  isVerified: boolean;

  createdAt: string;
  updatedAt: string;
};
