import { DeviceEventEmitter, Platform } from 'react-native';
import Purchases, {
  CustomerInfo,
  LOG_LEVEL,
  PurchasesError,
  PurchasesOffering,
  PurchasesPackage,
} from 'react-native-purchases';

import { getSettings, updateSettings } from '@/features/settings/settingsStorage';
import { SubscriptionPlan } from '@/features/settings/settingsTypes';

export const freePlanCatLimit = 2;
export const freePlanInventoryLimit = 10;
export const plusMonthlyPriceLabel = '月額300円';
export const plusAnnualPriceLabel = '年額3,000円';
export const subscriptionChangedEventName = 'nyan-stock:subscription-changed';
export const revenueCatPlusEntitlementId =
  process.env.EXPO_PUBLIC_REVENUECAT_PLUS_ENTITLEMENT_ID ?? 'nyanstock_plus';

const revenueCatIosApiKey = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
const revenueCatAndroidApiKey = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;
const revenueCatDebugLogsEnabled = process.env.EXPO_PUBLIC_REVENUECAT_DEBUG_LOGS === 'true';
const revenueCatAndroidEnabled = process.env.EXPO_PUBLIC_REVENUECAT_ENABLE_ANDROID === 'true';

let revenueCatConfigured = false;
let revenueCatListenerAttached = false;

export type SubscriptionEntitlement = {
  plan: SubscriptionPlan;
  isPlus: boolean;
  catLimit?: number;
  inventoryLimit?: number;
  shouldShowAds: boolean;
  source: 'revenuecat' | 'local' | 'unconfigured' | 'error';
  managementUrl?: string;
  activeProductIdentifier?: string;
  expirationDate?: string;
  errorMessage?: string;
};

export async function getSubscriptionEntitlement(): Promise<SubscriptionEntitlement> {
  const customerInfo = await getRevenueCatCustomerInfo();
  if (customerInfo) {
    const entitlement = await persistRevenueCatEntitlement(customerInfo);
    notifySubscriptionChanged(entitlement);
    return entitlement;
  }

  const settings = await getSettings();
  if (!hasRevenueCatApiKey()) {
    if (settings.subscriptionPlan !== 'free') {
      await updateSettings({ subscriptionPlan: 'free' });
    }
    return createSubscriptionEntitlement('free', { source: 'unconfigured' });
  }
  return createSubscriptionEntitlement(settings.subscriptionPlan, {
    source: 'error',
    errorMessage: 'RevenueCatの購読状態を取得できませんでした。',
  });
}

export function createSubscriptionEntitlement(
  plan: SubscriptionPlan,
  details: Partial<SubscriptionEntitlement> = {},
): SubscriptionEntitlement {
  const isPlus = plan === 'plus';
  return {
    plan,
    isPlus,
    catLimit: isPlus ? undefined : freePlanCatLimit,
    inventoryLimit: isPlus ? undefined : freePlanInventoryLimit,
    shouldShowAds: !isPlus,
    source: details.source ?? 'local',
    managementUrl: details.managementUrl,
    activeProductIdentifier: details.activeProductIdentifier,
    expirationDate: details.expirationDate,
    errorMessage: details.errorMessage,
  };
}

export function canCreateCat(entitlement: SubscriptionEntitlement, catCount: number): boolean {
  return entitlement.catLimit === undefined || catCount < entitlement.catLimit;
}

export function canCreateInventoryItem(
  entitlement: SubscriptionEntitlement,
  itemCount: number,
): boolean {
  return entitlement.inventoryLimit === undefined || itemCount < entitlement.inventoryLimit;
}

export function hasRevenueCatApiKey(): boolean {
  if (!isRevenueCatEnabledForPlatform()) return false;
  return Boolean(getRevenueCatApiKey());
}

export async function configureRevenueCat(): Promise<boolean> {
  if (!isRevenueCatEnabledForPlatform()) return false;
  if (revenueCatConfigured) return true;
  const apiKey = getRevenueCatApiKey();
  if (!apiKey) return false;

  if (revenueCatDebugLogsEnabled) {
    await Purchases.setLogLevel(LOG_LEVEL.VERBOSE);
  }
  Purchases.configure({ apiKey });
  revenueCatConfigured = true;

  if (!revenueCatListenerAttached) {
    Purchases.addCustomerInfoUpdateListener((customerInfo) => {
      void persistRevenueCatEntitlement(customerInfo).then(notifySubscriptionChanged);
    });
    revenueCatListenerAttached = true;
  }

  const customerInfo = await Purchases.getCustomerInfo();
  notifySubscriptionChanged(await persistRevenueCatEntitlement(customerInfo));
  return true;
}

export async function getCurrentOffering(): Promise<PurchasesOffering | undefined> {
  const configured = await configureRevenueCat();
  if (!configured) return undefined;
  const offerings = await Purchases.getOfferings();
  return offerings.current ?? undefined;
}

export async function purchasePlusPackage(
  nextPackage: PurchasesPackage,
): Promise<SubscriptionEntitlement> {
  await configureRevenueCat();
  const result = await Purchases.purchasePackage(nextPackage);
  const entitlement = await persistRevenueCatEntitlement(result.customerInfo);
  notifySubscriptionChanged(entitlement);
  return entitlement;
}

export async function restorePlusPurchase(): Promise<SubscriptionEntitlement> {
  await configureRevenueCat();
  const customerInfo = await Purchases.restorePurchases();
  const entitlement = await persistRevenueCatEntitlement(customerInfo);
  notifySubscriptionChanged(entitlement);
  return entitlement;
}

export function isPurchaseCancelled(error: unknown): boolean {
  return (
    isPurchasesError(error) &&
    error.code === Purchases.PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR
  );
}

export function getSubscriptionErrorMessage(error: unknown): string {
  if (isPurchasesError(error)) {
    return error.message || error.underlyingErrorMessage || 'RevenueCatでエラーが発生しました。';
  }
  return error instanceof Error ? error.message : 'しばらくしてからもう一度お試しください。';
}

function getRevenueCatApiKey(): string | undefined {
  const apiKey =
    Platform.OS === 'ios'
      ? revenueCatIosApiKey
      : Platform.OS === 'android' && revenueCatAndroidEnabled
        ? revenueCatAndroidApiKey
        : undefined;
  return apiKey?.trim() || undefined;
}

function isRevenueCatEnabledForPlatform(): boolean {
  return Platform.OS === 'ios' || (Platform.OS === 'android' && revenueCatAndroidEnabled);
}

async function getRevenueCatCustomerInfo(): Promise<CustomerInfo | undefined> {
  try {
    const configured = await configureRevenueCat();
    if (!configured) return undefined;
    return await Purchases.getCustomerInfo();
  } catch (error) {
    console.warn('[RevenueCat] Failed to fetch customer info', error);
    return undefined;
  }
}

async function persistRevenueCatEntitlement(
  customerInfo: CustomerInfo,
): Promise<SubscriptionEntitlement> {
  const plusEntitlement = customerInfo.entitlements.active[revenueCatPlusEntitlementId];
  const nextPlan: SubscriptionPlan = plusEntitlement ? 'plus' : 'free';
  const settings = await getSettings();
  if (settings.subscriptionPlan !== nextPlan) {
    await updateSettings({ subscriptionPlan: nextPlan });
  }

  return createSubscriptionEntitlement(nextPlan, {
    source: 'revenuecat',
    managementUrl: customerInfo.managementURL ?? undefined,
    activeProductIdentifier: plusEntitlement?.productIdentifier,
    expirationDate: plusEntitlement?.expirationDate ?? undefined,
  });
}

function notifySubscriptionChanged(entitlement: SubscriptionEntitlement): void {
  DeviceEventEmitter.emit(subscriptionChangedEventName, entitlement);
}

function isPurchasesError(error: unknown): error is PurchasesError {
  return typeof error === 'object' && error !== null && 'code' in error;
}
