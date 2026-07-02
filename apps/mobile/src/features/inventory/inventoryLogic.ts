import { addDays, differenceInCalendarDays, parseISO } from 'date-fns';

import { InventoryItem, InventoryStatus } from './inventoryTypes';

function baseDateOf(item: InventoryItem) {
  return item.openedDate || item.purchaseDate;
}

export function calculateEstimatedEndDate(item: InventoryItem): string | undefined {
  if (!item.dailyUsage || item.dailyUsage <= 0 || item.amount <= 0) return undefined;
  const totalDays = Math.ceil(item.amount / item.dailyUsage);
  return addDays(parseISO(baseDateOf(item)), totalDays).toISOString().slice(0, 10);
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
  if (!item.dailyUsage || item.dailyUsage <= 0 || item.amount <= 0) return undefined;
  const totalDays = Math.ceil(item.amount / item.dailyUsage);
  if (totalDays <= 0) return undefined;
  const remainingDays = calculateRemainingDays(item, today);
  if (remainingDays === undefined) return undefined;
  return Math.max(0, Math.min(100, Math.round((remainingDays / totalDays) * 100)));
}

export function getInventoryStatus(item: InventoryItem): InventoryStatus {
  if (!item.dailyUsage || item.dailyUsage <= 0) return 'unknown';
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
