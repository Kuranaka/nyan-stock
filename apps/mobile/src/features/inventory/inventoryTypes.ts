export type InventoryCategory =
  'dry_food' | 'wet_food' | 'treat' | 'cat_litter' | 'supplement' | 'medicine' | 'care' | 'other';

export type InventoryUnit = 'g' | 'kg' | 'ml' | 'L' | 'piece' | 'bag';

export type PurchaseLinks = {
  amazon?: string;
  rakuten?: string;
  yahoo?: string;
  other?: string;
};

export type InventoryEstimationMode =
  'usage' | 'lasting_days' | 'purchase_frequency' | 'no_estimate';
export type LastingDaysReplenishMode = 'add_remaining' | 'reset_cycle';
export type PurchaseHistoryRecordType = 'replenishment' | 'manual';

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
  purchaseFrequencyDays?: number;
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
  /** Product name at the time of purchase, retained after the inventory item is deleted. */
  itemName?: string;
  /** Product category at the time of purchase. Legacy entries may not have this field. */
  itemCategory?: InventoryCategory;
  /** Target pet IDs at the time of purchase. Legacy entries may not have this field. */
  catIds?: string[];
  /** How this history entry was created. Legacy entries may not have this field. */
  recordType?: PurchaseHistoryRecordType;
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
