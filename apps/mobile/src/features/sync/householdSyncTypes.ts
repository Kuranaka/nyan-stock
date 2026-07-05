import { Cat } from '@/features/cats/catTypes';
import { InventoryItem, PurchaseHistory } from '@/features/inventory/inventoryTypes';

export type HouseholdSyncState = {
  householdId: string;
  joinedAt: string;
  createdBy?: string;
  lastPulledAt?: string;
  lastPushedAt?: string;
};

export type HouseholdSnapshot = {
  cats: Cat[];
  inventoryItems: InventoryItem[];
  purchaseHistory: PurchaseHistory[];
  updatedAt: string;
  updatedBy?: string;
};

export type RemoteHouseholdSnapshot = {
  householdId: string;
  snapshot: HouseholdSnapshot;
  updatedAt: string;
  updatedBy?: string;
};
