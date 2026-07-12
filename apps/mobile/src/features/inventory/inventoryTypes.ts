export type InventoryCategory =
  | 'dry_food'
  | 'wet_food'
  | 'treat'
  | 'cat_litter'
  | 'supplement'
  | 'medicine'
  | 'care'
  | 'other';

export type InventoryUnit = 'g' | 'kg' | 'ml' | 'L' | 'piece' | 'bag';

export type PurchaseLinks = {
  amazon?: string;
  rakuten?: string;
  yahoo?: string;
  other?: string;
};

export type InventoryEstimationMode = 'usage' | 'lasting_days' | 'purchase_frequency' | 'no_estimate';
export type LastingDaysReplenishMode = 'add_remaining' | 'reset_cycle';

export type InventoryItem = {
  id: string;
  catId: string;
  sharedCatIds?: string[];
  productMasterId?: string;
  imageUrl?: string;
  price?: number;
  name: string;
  category: InventoryCategory;
  amount: number;
  unit: InventoryUnit;
  dailyUsage?: number;
  lastingDays?: number;
  purchaseDate: string;
  openedDate?: string;
  estimatedEndDate?: string;
  estimationMode?: InventoryEstimationMode;
  notifyBeforeDays: number[];
  purchaseLinks: PurchaseLinks;
  memo?: string;
  createdAt: string;
  updatedAt: string;
};

export type PurchaseHistory = {
  id: string;
  inventoryItemId: string;
  purchasedAt: string;
  amount: number;
  unit: InventoryUnit;
  price?: number;
  shopName?: string;
  purchaseUrl?: string;
  memo?: string;
  createdAt: string;
};

export type InventoryStatus = 'in_stock' | 'watch' | 'warning' | 'out' | 'unknown';
