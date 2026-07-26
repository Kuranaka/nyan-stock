import { addDays, differenceInCalendarDays, format, isValid, parseISO } from 'date-fns';

import type { PurchaseHistory } from './inventoryTypes';

export type PurchaseFrequencyPrediction = {
  averageIntervalDays: number;
  estimatedEndDate: string;
};

export function calculatePurchaseFrequencyPrediction(
  inventoryItemId: string,
  history: PurchaseHistory[],
): PurchaseFrequencyPrediction | undefined {
  const replenishmentDates = history
    .filter(
      (entry) => entry.inventoryItemId === inventoryItemId && entry.recordType === 'replenishment',
    )
    .map((entry) => parseISO(entry.purchasedAt))
    .filter(isValid);

  const uniqueDates = Array.from(
    new Map(replenishmentDates.map((date) => [date.getTime(), date])).values(),
  ).sort((a, b) => a.getTime() - b.getTime());

  if (uniqueDates.length < 2) return undefined;

  const intervals = uniqueDates
    .slice(1)
    .map((date, index) => differenceInCalendarDays(date, uniqueDates[index]))
    .filter((days) => days > 0);

  if (intervals.length === 0) return undefined;

  const averageIntervalDays = Math.max(
    1,
    Math.round(intervals.reduce((total, days) => total + days, 0) / intervals.length),
  );
  const latestPurchaseDate = uniqueDates[uniqueDates.length - 1];

  return {
    averageIntervalDays,
    estimatedEndDate: format(addDays(latestPurchaseDate, averageIntervalDays), 'yyyy-MM-dd'),
  };
}
