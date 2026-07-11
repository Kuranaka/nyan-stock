import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';

import { InventoryItem, InventoryStatus } from './inventoryTypes';

export function getInventoryCatIds(item: InventoryItem): string[] {
  return Array.from(new Set([item.catId, ...(item.sharedCatIds ?? [])].filter(Boolean)));
}

export function isInventoryItemForCat(item: InventoryItem, catId: string): boolean {
  return getInventoryCatIds(item).includes(catId);
}

function baseDateOf(item: InventoryItem) {
  return item.openedDate || item.purchaseDate;
}

export function calculateEstimatedEndDate(item: InventoryItem): string | undefined {
  if (item.estimationMode === 'lasting_days' && item.lastingDays && item.lastingDays > 0) {
    return format(addDays(parseISO(item.purchaseDate), item.lastingDays), 'yyyy-MM-dd');
  }
  if (!item.dailyUsage || item.dailyUsage <= 0 || item.amount <= 0) return undefined;
  const totalDays = Math.ceil(item.amount / item.dailyUsage);
  return format(addDays(parseISO(baseDateOf(item)), totalDays), 'yyyy-MM-dd');
}

export function calculateRemainingDays(
  item: InventoryItem,
  today: Date = new Date(),
): number | undefined {
  const estimatedEndDate = item.estimatedEndDate || calculateEstimatedEndDate(item);
  if (!estimatedEndDate) return undefined;
  return differenceInCalendarDays(parseISO(estimatedEndDate), today);
}

export function calculateRemainingPercent(
  item: InventoryItem,
  today: Date = new Date(),
): number | undefined {
  if (item.estimationMode === 'lasting_days' && item.lastingDays && item.lastingDays > 0) {
    const remainingDays = calculateRemainingDays(item, today);
    if (remainingDays === undefined) return undefined;
    return Math.max(0, Math.round((remainingDays / item.lastingDays) * 100));
  }

  if (item.estimationMode === 'purchase_frequency' && item.estimatedEndDate) {
    const totalDays = calculatePurchaseFrequencyDays(item);
    if (totalDays === undefined) return undefined;
    const remainingDays = calculateRemainingDays(item, today);
    if (remainingDays === undefined) return undefined;
    return Math.max(0, Math.round((remainingDays / totalDays) * 100));
  }

  if (!item.dailyUsage || item.dailyUsage <= 0 || item.amount <= 0) return undefined;
  const totalDays = Math.ceil(item.amount / item.dailyUsage);
  if (totalDays <= 0) return undefined;
  const remainingDays = calculateRemainingDays(item, today);
  if (remainingDays === undefined) return undefined;
  return Math.max(0, Math.round((remainingDays / totalDays) * 100));
}

export function calculatePurchaseFrequencyDays(item: InventoryItem): number | undefined {
  if (item.estimationMode !== 'purchase_frequency' || !item.estimatedEndDate) return undefined;
  const days = differenceInCalendarDays(parseISO(item.estimatedEndDate), parseISO(item.purchaseDate));
  return days > 0 ? days : undefined;
}

export function calculateInventoryCycleDays(item: InventoryItem): number | undefined {
  if (item.estimationMode === 'lasting_days') {
    return item.lastingDays && item.lastingDays > 0 ? item.lastingDays : undefined;
  }

  if (item.estimationMode === 'purchase_frequency') {
    return calculatePurchaseFrequencyDays(item);
  }

  if (!item.dailyUsage || item.dailyUsage <= 0 || item.amount <= 0) return undefined;
  return Math.ceil(item.amount / item.dailyUsage);
}

export function calculateMonthlyCost(item: InventoryItem): number | undefined {
  const cycleDays = calculateInventoryCycleDays(item);
  if (item.price === undefined || item.price < 0 || !cycleDays || cycleDays <= 0) return undefined;
  return (item.price / cycleDays) * 30;
}

export function getInventoryStatus(item: InventoryItem): InventoryStatus {
  if (!item.estimatedEndDate && (!item.dailyUsage || item.dailyUsage <= 0)) return 'unknown';
  const remainingDays = calculateRemainingDays(item);
  if (remainingDays === undefined) return 'unknown';
  if (remainingDays <= 0) return 'out';
  if (remainingDays <= 3) return 'warning';
  if (remainingDays <= 7) return 'watch';
  return 'in_stock';
}

export function sortInventoryItems(items: InventoryItem[]): InventoryItem[] {
  return [...items].sort((a, b) => {
    const aDays = calculateRemainingDays(a);
    const bDays = calculateRemainingDays(b);
    if (aDays === undefined && bDays === undefined) return a.name.localeCompare(b.name, 'ja');
    if (aDays === undefined) return 1;
    if (bDays === undefined) return -1;
    return aDays - bDays;
  });
}
