export type PetProductGroup =
  | 'cat'
  | 'dog'
  | 'rabbit'
  | 'small_animal'
  | 'bird'
  | 'aquarium'
  | 'reptile_amphibian'
  | 'insect';

export type PetProductMasterRetailer = {
  source: 'rakuten_ichiba' | 'rakuten_product_navi' | 'yahoo_shopping';
  sourceItemId: string;
  shopName?: string;
  price?: number;
  currency: string;
  itemUrl?: string;
  affiliateUrl?: string;
  imageUrl?: string;
  availability?: boolean;
  fetchedAt: string;
};

export type PetProductMaster = {
  id: string;
  productId: string;
  variantId: string;
  name: string;
  normalizedName: string;
  baseProductName: string;
  brand?: string;
  series?: string;

  petGroup: PetProductGroup;
  targetSpecies: string[];
  targetSpeciesGroup?: string;
  targetScope: 'species_specific' | 'multi_species' | 'group_wide';
  targetSize?: string;
  targetAge?: string;
  lifeStage?: string;
  habitatType?: string;
  feedingType?: string;

  categoryId: string;
  subcategoryId: string;
  purpose?: string;
  productFunction?: string;
  flavor?: string;
  primaryIngredient?: string;

  capacityValue?: number;
  capacityUnit?: string;
  quantity?: number;
  packageType?: 'main' | 'refill';
  janCode?: string;
  modelNumber?: string;

  imageUrl?: string;
  imageUrls: string[];
  retailers: PetProductMasterRetailer[];
  sourceLocale: string;
  marketCodes: string[];
  confidence: number;
  status: 'draft' | 'published' | 'retired';
  createdAt: string;
  updatedAt: string;
};
