import {
  calculateInventoryCycleDays,
  calculateMonthlyCost,
  getInventoryPredictionState,
} from './inventoryLogic';
import { InventoryItem } from './inventoryTypes';

export type MonthlyCostRow = {
  item: InventoryItem;
  cycleDays: number | undefined;
  monthlyCost: number | undefined;
};

export type EstimatedMonthlyCostRow = MonthlyCostRow & {
  monthlyCost: number;
};

export type MonthlyCostAnalysis = {
  estimatedRows: EstimatedMonthlyCostRow[];
  excludedRows: MonthlyCostRow[];
  monthlyEstimate: number;
};

export type MonthlyCostChartRow = {
  id: string;
  label: string;
  monthlyCost: number;
  percentage: number;
  itemId?: string;
};

export type MonthlyCostExclusionReason = {
  label: string;
  detail: string;
};

export function buildMonthlyCostAnalysis(items: InventoryItem[]): MonthlyCostAnalysis {
  const rows: MonthlyCostRow[] = items.map((item) => ({
    item,
    cycleDays: calculateInventoryCycleDays(item),
    monthlyCost: calculateMonthlyCost(item),
  }));
  const estimatedRows = rows
    .filter((row): row is EstimatedMonthlyCostRow => row.monthlyCost !== undefined)
    .sort((first, second) => second.monthlyCost - first.monthlyCost);
  const excludedRows = rows
    .filter((row) => row.monthlyCost === undefined)
    .sort((first, second) => first.item.name.localeCompare(second.item.name, 'ja'));

  return {
    estimatedRows,
    excludedRows,
    monthlyEstimate: estimatedRows.reduce((sum, row) => sum + row.monthlyCost, 0),
  };
}

export function buildMonthlyCostChartRows(
  estimatedRows: EstimatedMonthlyCostRow[],
  maxIndividualRows = 5,
): MonthlyCostChartRow[] {
  const monthlyEstimate = estimatedRows.reduce((sum, row) => sum + row.monthlyCost, 0);
  const toPercentage = (monthlyCost: number) =>
    monthlyEstimate > 0 ? (monthlyCost / monthlyEstimate) * 100 : 0;
  const individualRows = estimatedRows.slice(0, maxIndividualRows).map((row) => ({
    id: row.item.id,
    itemId: row.item.id,
    label: row.item.name,
    monthlyCost: row.monthlyCost,
    percentage: toPercentage(row.monthlyCost),
  }));
  const remainingRows = estimatedRows.slice(maxIndividualRows);

  if (remainingRows.length === 0) return individualRows;

  const remainingCost = remainingRows.reduce((sum, row) => sum + row.monthlyCost, 0);
  return [
    ...individualRows,
    {
      id: 'other',
      label: `その他${remainingRows.length}用品`,
      monthlyCost: remainingCost,
      percentage: toPercentage(remainingCost),
    },
  ];
}

export function getMonthlyCostExclusionReason(
  item: InventoryItem,
  cycleDays: number | undefined,
): MonthlyCostExclusionReason {
  const predictionState = getInventoryPredictionState(item);

  if (predictionState === 'learning') {
    return {
      label: '購入頻度を学習中',
      detail:
        item.price === undefined
          ? '補充記録が2件たまると自動で反映します。価格はあとから追加できます。'
          : '補充記録が2件たまると自動で反映します。',
    };
  }
  if (predictionState === 'disabled') {
    return {
      label: '月額予測の対象外',
      detail: '「日数表示なし」にしている用品です。',
    };
  }
  if (item.price === undefined) {
    return {
      label: '価格未入力',
      detail: '商品詳細から価格を追加できます。',
    };
  }
  if (cycleDays === undefined) {
    return {
      label: '周期を計算できません',
      detail: '現在の情報では月額予測を出せません。',
    };
  }
  return {
    label: '月額予測の対象外',
    detail: '現在の情報では月額予測を出せません。',
  };
}
