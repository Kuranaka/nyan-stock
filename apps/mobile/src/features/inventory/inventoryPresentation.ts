import { unitLabels } from '@/constants/categories';

import { calculateRemainingDays, calculateRemainingPercent } from './inventoryLogic';
import type { InventoryItem } from './inventoryTypes';

export function formatRemainingStockValue(
  item: InventoryItem,
  percent: number | undefined,
): string {
  if (percent === undefined) return '未設定';
  if (item.estimationMode === 'lasting_days') {
    if (item.amount > 0) {
      return `${formatQuantity((item.amount * Math.max(0, percent)) / 100)}${unitLabels[item.unit]}`;
    }
    return `${percent}%`;
  }
  if (item.amount <= 0) return '未設定';
  if (!item.estimationMode || item.estimationMode === 'usage') {
    const remainingAmount = calculateRemainingAmount(item);
    if (remainingAmount === undefined) return `${percent}%`;
    return `${formatQuantity(remainingAmount)}${unitLabels[item.unit]}`;
  }
  return `${percent}%`;
}

export function formatNotifyBeforeDays(days: number[]): string {
  if (days.length === 0) return '通知なし';
  return [...days]
    .sort((a, b) => b - a)
    .map((day) => `残り${day}日`)
    .join('・');
}

export function calculateRemainingAmount(item: InventoryItem): number | undefined {
  if (!item.estimationMode || item.estimationMode === 'usage') {
    const remainingDays = calculateRemainingDays(item);
    if (remainingDays === undefined || !item.dailyUsage || item.dailyUsage <= 0) return undefined;
    return Math.min(item.amount, Math.max(0, remainingDays * item.dailyUsage));
  }
  const percent = calculateRemainingPercent(item);
  if (percent === undefined || item.amount <= 0) return undefined;
  return (item.amount * Math.max(0, percent)) / 100;
}

export function formatQuantity(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(Math.round(value * 10) / 10);
}

export function getReplenishAmount(item: InventoryItem): number {
  return item.amount;
}
