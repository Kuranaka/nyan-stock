import type { AuthSession } from '../auth/authTypes';
import type { Cat, CatGender, PetType } from '../cats/catTypes';
import type {
  InventoryCategory,
  InventoryEstimationMode,
  InventoryItem,
  InventoryUnit,
  PurchaseHistory,
  PurchaseHistoryRecordType,
  PurchaseLinks,
} from '../inventory/inventoryTypes';
import { defaultSettings, type AppSettings, type SubscriptionPlan } from '../settings/settingsTypes.ts';
import type { HouseholdSyncState } from '../sync/householdSyncTypes';
import {
  isFiniteNumber,
  isOptionalString,
  isRecord,
  type StorageSchema,
} from './storageCodec.ts';

const currentStorageVersion = 1;
const petTypes = new Set<PetType>([
  'cat',
  'dog',
  'rabbit',
  'small_mammal',
  'bird',
  'aquarium_fish',
  'reptile_amphibian',
  'insect',
]);
const genders = new Set<CatGender>(['male', 'female', 'unknown']);
const inventoryCategories = new Set<InventoryCategory>([
  'dry_food',
  'wet_food',
  'treat',
  'cat_litter',
  'supplement',
  'medicine',
  'care',
  'other',
]);
const inventoryUnits = new Set<InventoryUnit>(['g', 'kg', 'ml', 'L', 'piece', 'bag']);
const estimationModes = new Set<InventoryEstimationMode>([
  'usage',
  'lasting_days',
  'purchase_frequency',
  'no_estimate',
]);
const recordTypes = new Set<PurchaseHistoryRecordType>(['replenishment', 'manual']);
const subscriptionPlans = new Set<SubscriptionPlan>(['free', 'plus']);

export const catsStorageSchema: StorageSchema<Cat[]> = arraySchema(normalizeCat, isCat);
export const inventoryItemsStorageSchema: StorageSchema<InventoryItem[]> = arraySchema(
  normalizeInventoryItem,
  isInventoryItem,
);
export const purchaseHistoryStorageSchema: StorageSchema<PurchaseHistory[]> = arraySchema(
  normalizePurchaseHistory,
  isPurchaseHistory,
);

export const settingsStorageSchema: StorageSchema<AppSettings> = {
  currentVersion: currentStorageVersion,
  fallback: () => ({ ...defaultSettings }),
  migrate: (value) => normalizeSettings(value),
  validate: isSettings,
};

export const authSessionStorageSchema: StorageSchema<AuthSession | undefined> = {
  currentVersion: currentStorageVersion,
  fallback: () => undefined,
  migrate: (value) => (isAuthSession(value) ? value : undefined),
  validate: (value): value is AuthSession | undefined => value === undefined || isAuthSession(value),
};

export const householdSyncStorageSchema: StorageSchema<HouseholdSyncState | undefined> = {
  currentVersion: currentStorageVersion,
  fallback: () => undefined,
  migrate: (value) => (isHouseholdSyncState(value) ? value : undefined),
  validate: (value): value is HouseholdSyncState | undefined =>
    value === undefined || isHouseholdSyncState(value),
};

function arraySchema<T>(
  normalize: (value: unknown) => T | undefined,
  validateItem: (value: unknown) => value is T,
): StorageSchema<T[]> {
  return {
    currentVersion: currentStorageVersion,
    fallback: () => [],
    migrate: (value) => (Array.isArray(value) ? value.map(normalize).filter(isDefined) : []),
    validate: (value): value is T[] => Array.isArray(value) && value.every(validateItem),
  };
}

function normalizeCat(value: unknown): Cat | undefined {
  if (!isRecord(value) || !hasRequiredStrings(value, ['id', 'name', 'createdAt', 'updatedAt'])) {
    return undefined;
  }
  return {
    id: value.id,
    name: value.name,
    petType: petTypes.has(value.petType as PetType) ? (value.petType as PetType) : undefined,
    iconUrl: optionalString(value.iconUrl),
    birthday: optionalString(value.birthday),
    age: optionalFiniteNumber(value.age),
    weight: optionalFiniteNumber(value.weight),
    gender: genders.has(value.gender as CatGender) ? (value.gender as CatGender) : 'unknown',
    memo: optionalString(value.memo),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function isCat(value: unknown): value is Cat {
  if (!isRecord(value) || !hasRequiredStrings(value, ['id', 'name', 'createdAt', 'updatedAt'])) {
    return false;
  }
  return (
    genders.has(value.gender as CatGender) &&
    (value.petType === undefined || petTypes.has(value.petType as PetType)) &&
    optionalFieldsAreValid(value, ['iconUrl', 'birthday', 'memo']) &&
    optionalNumbersAreValid(value, ['age', 'weight'])
  );
}

function normalizeInventoryItem(value: unknown): InventoryItem | undefined {
  if (!isRecord(value) || !hasRequiredStrings(value, ['id', 'catId', 'name', 'purchaseDate', 'createdAt', 'updatedAt'])) {
    return undefined;
  }
  const category = inventoryCategories.has(value.category as InventoryCategory)
    ? (value.category as InventoryCategory)
    : 'other';
  const unit = inventoryUnits.has(value.unit as InventoryUnit) ? (value.unit as InventoryUnit) : 'piece';
  const amount = isFiniteNumber(value.amount) && value.amount >= 0 ? value.amount : 0;
  const links = normalizePurchaseLinks(value.purchaseLinks);
  return {
    id: value.id,
    catId: value.catId,
    sharedCatIds: stringArrayOrUndefined(value.sharedCatIds),
    productMasterId: optionalString(value.productMasterId),
    imageUrl: optionalString(value.imageUrl),
    price: optionalFiniteNumber(value.price),
    name: value.name,
    category,
    amount,
    unit,
    dailyUsage: optionalFiniteNumber(value.dailyUsage),
    lastingDays: optionalFiniteNumber(value.lastingDays),
    purchaseDate: value.purchaseDate,
    openedDate: optionalString(value.openedDate),
    estimatedEndDate: optionalString(value.estimatedEndDate),
    purchaseFrequencyDays: optionalFiniteNumber(value.purchaseFrequencyDays),
    estimationMode: estimationModes.has(value.estimationMode as InventoryEstimationMode)
      ? (value.estimationMode as InventoryEstimationMode)
      : undefined,
    notifyBeforeDays: finiteNumberArray(value.notifyBeforeDays),
    purchaseLinks: links,
    memo: optionalString(value.memo),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function isInventoryItem(value: unknown): value is InventoryItem {
  if (!isRecord(value) || !hasRequiredStrings(value, ['id', 'catId', 'name', 'purchaseDate', 'createdAt', 'updatedAt'])) {
    return false;
  }
  return (
    inventoryCategories.has(value.category as InventoryCategory) &&
    inventoryUnits.has(value.unit as InventoryUnit) &&
    isFiniteNumber(value.amount) &&
    value.amount >= 0 &&
    Array.isArray(value.notifyBeforeDays) &&
    value.notifyBeforeDays.every(isFiniteNumber) &&
    isPurchaseLinks(value.purchaseLinks) &&
    (value.estimationMode === undefined ||
      estimationModes.has(value.estimationMode as InventoryEstimationMode)) &&
    (value.sharedCatIds === undefined || isStringArray(value.sharedCatIds)) &&
    optionalFieldsAreValid(value, [
      'productMasterId',
      'imageUrl',
      'openedDate',
      'estimatedEndDate',
      'memo',
    ]) &&
    optionalNumbersAreValid(value, [
      'price',
      'dailyUsage',
      'lastingDays',
      'purchaseFrequencyDays',
    ])
  );
}

function normalizePurchaseHistory(value: unknown): PurchaseHistory | undefined {
  if (!isRecord(value) || !hasRequiredStrings(value, ['id', 'inventoryItemId', 'purchasedAt', 'createdAt'])) {
    return undefined;
  }
  return {
    id: value.id,
    inventoryItemId: value.inventoryItemId,
    itemName: optionalString(value.itemName),
    itemCategory: inventoryCategories.has(value.itemCategory as InventoryCategory)
      ? (value.itemCategory as InventoryCategory)
      : undefined,
    catIds: stringArrayOrUndefined(value.catIds),
    recordType: recordTypes.has(value.recordType as PurchaseHistoryRecordType)
      ? (value.recordType as PurchaseHistoryRecordType)
      : undefined,
    purchasedAt: value.purchasedAt,
    amount: isFiniteNumber(value.amount) && value.amount >= 0 ? value.amount : 0,
    unit: inventoryUnits.has(value.unit as InventoryUnit) ? (value.unit as InventoryUnit) : 'piece',
    price: optionalFiniteNumber(value.price),
    shopName: optionalString(value.shopName),
    purchaseUrl: optionalString(value.purchaseUrl),
    memo: optionalString(value.memo),
    createdAt: value.createdAt,
  };
}

function isPurchaseHistory(value: unknown): value is PurchaseHistory {
  if (!isRecord(value) || !hasRequiredStrings(value, ['id', 'inventoryItemId', 'purchasedAt', 'createdAt'])) {
    return false;
  }
  return (
    isFiniteNumber(value.amount) &&
    value.amount >= 0 &&
    inventoryUnits.has(value.unit as InventoryUnit) &&
    (value.itemCategory === undefined ||
      inventoryCategories.has(value.itemCategory as InventoryCategory)) &&
    (value.recordType === undefined || recordTypes.has(value.recordType as PurchaseHistoryRecordType)) &&
    (value.catIds === undefined || isStringArray(value.catIds)) &&
    optionalFieldsAreValid(value, ['itemName', 'shopName', 'purchaseUrl', 'memo']) &&
    optionalNumbersAreValid(value, ['price'])
  );
}

function normalizeSettings(value: unknown): AppSettings {
  if (!isRecord(value)) return { ...defaultSettings };
  return {
    onboardingCompleted:
      typeof value.onboardingCompleted === 'boolean'
        ? value.onboardingCompleted
        : defaultSettings.onboardingCompleted,
    notificationsEnabled:
      typeof value.notificationsEnabled === 'boolean'
        ? value.notificationsEnabled
        : defaultSettings.notificationsEnabled,
    notificationPermissionPrompted:
      typeof value.notificationPermissionPrompted === 'boolean'
        ? value.notificationPermissionPrompted
        : defaultSettings.notificationPermissionPrompted,
    notificationHour: boundedInteger(value.notificationHour, 0, 23, defaultSettings.notificationHour),
    notificationMinute: boundedInteger(
      value.notificationMinute,
      0,
      59,
      defaultSettings.notificationMinute,
    ),
    subscriptionPlan: subscriptionPlans.has(value.subscriptionPlan as SubscriptionPlan)
      ? (value.subscriptionPlan as SubscriptionPlan)
      : defaultSettings.subscriptionPlan,
    selectedCatId: optionalString(value.selectedCatId),
  };
}

function isSettings(value: unknown): value is AppSettings {
  return Boolean(
    isRecord(value) &&
      typeof value.onboardingCompleted === 'boolean' &&
      typeof value.notificationsEnabled === 'boolean' &&
      typeof value.notificationPermissionPrompted === 'boolean' &&
      Number.isInteger(value.notificationHour) &&
      (value.notificationHour as number) >= 0 &&
      (value.notificationHour as number) <= 23 &&
      Number.isInteger(value.notificationMinute) &&
      (value.notificationMinute as number) >= 0 &&
      (value.notificationMinute as number) <= 59 &&
      subscriptionPlans.has(value.subscriptionPlan as SubscriptionPlan) &&
      isOptionalString(value.selectedCatId),
  );
}

function isAuthSession(value: unknown): value is AuthSession {
  return Boolean(
    isRecord(value) &&
      ['guest', 'google', 'apple', 'x'].includes(String(value.provider)) &&
      hasRequiredStrings(value, ['providerUserId', 'signedInAt']) &&
      optionalFieldsAreValid(value, ['supabaseUserId', 'email', 'name', 'photoUrl']),
  );
}

function isHouseholdSyncState(value: unknown): value is HouseholdSyncState {
  return Boolean(
    isRecord(value) &&
      hasRequiredStrings(value, ['householdId', 'joinedAt']) &&
      optionalFieldsAreValid(value, [
        'inviteCode',
        'createdBy',
        'joinedBy',
        'lastPulledAt',
        'lastPushedAt',
      ]),
  );
}

function normalizePurchaseLinks(value: unknown): PurchaseLinks {
  if (!isRecord(value)) return {};
  return {
    amazon: optionalString(value.amazon),
    rakuten: optionalString(value.rakuten),
    yahoo: optionalString(value.yahoo),
    other: optionalString(value.other),
  };
}

function isPurchaseLinks(value: unknown): value is PurchaseLinks {
  return isRecord(value) && optionalFieldsAreValid(value, ['amazon', 'rakuten', 'yahoo', 'other']);
}

function hasRequiredStrings<const K extends readonly string[]>(
  value: Record<string, unknown>,
  keys: K,
): value is Record<string, unknown> & { [P in K[number]]: string } {
  return keys.every((key) => typeof value[key] === 'string' && value[key].trim() !== '');
}

function optionalFieldsAreValid(value: Record<string, unknown>, keys: string[]): boolean {
  return keys.every((key) => isOptionalString(value[key]));
}

function optionalNumbersAreValid(value: Record<string, unknown>, keys: string[]): boolean {
  return keys.every((key) => value[key] === undefined || isFiniteNumber(value[key]));
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function optionalFiniteNumber(value: unknown): number | undefined {
  return isFiniteNumber(value) ? value : undefined;
}

function finiteNumberArray(value: unknown): number[] {
  return Array.isArray(value) ? value.filter(isFiniteNumber) : [];
}

function stringArrayOrUndefined(value: unknown): string[] | undefined {
  return isStringArray(value) && value.length > 0 ? value : undefined;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function boundedInteger(value: unknown, min: number, max: number, fallback: number): number {
  return Number.isInteger(value) && (value as number) >= min && (value as number) <= max
    ? (value as number)
    : fallback;
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}
