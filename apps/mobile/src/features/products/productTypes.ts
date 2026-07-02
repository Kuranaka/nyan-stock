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

export type ProductSource =
  | 'manual'
  | 'jan'
  | 'amazon'
  | 'rakuten'
  | 'yahoo'
  | 'official'
  | 'user';

export type ProductMaster = {
  id: string;

  name: string;
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
  visualKeywords?: string[];

  purchaseLinks?: {
    amazon?: string;
    rakuten?: string;
    yahoo?: string;
    official?: string;
  };

  searchKeywords: string[];
  normalizedName: string;

  source: ProductSource;
  confidence: number;

  createdAt: string;
  updatedAt: string;
};

export type UserProductSuggestion = {
  id: string;
  name: string;
  category?: ProductCategory;
  janCode?: string;
  purchaseUrl?: string;
  imageUrl?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  updatedAt: string;
};
