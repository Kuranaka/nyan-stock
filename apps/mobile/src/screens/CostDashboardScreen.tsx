import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { isSameMonth, parseISO } from 'date-fns';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/AppButton';
import { AppCard } from '@/components/AppCard';
import { EmptyState } from '@/components/EmptyState';
import { categoryLabels } from '@/constants/categories';
import { colors } from '@/constants/colors';
import { getCats } from '@/features/cats/catStorage';
import { Cat } from '@/features/cats/catTypes';
import {
  calculateInventoryCycleDays,
  calculateMonthlyCost,
  getInventoryCatIds,
  isInventoryItemForCat,
} from '@/features/inventory/inventoryLogic';
import { getInventoryItems, getPurchaseHistory } from '@/features/inventory/inventoryStorage';
import {
  InventoryCategory,
  InventoryItem,
  PurchaseHistory,
} from '@/features/inventory/inventoryTypes';
import { useHouseholdSyncEvents } from '@/features/sync/useHouseholdSyncEvents';

const allCatsFilter = 'all';
const chartColors = [
  '#D99A4E',
  '#4E9F3D',
  '#F0A202',
  '#6C8AE4',
  '#D9534F',
  '#8A6BBE',
  '#3AA6A6',
  '#A86421',
];
const donutSegmentCount = 72;

export default function CostDashboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [cats, setCats] = useState<Cat[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [history, setHistory] = useState<PurchaseHistory[]>([]);
  const [selectedCatId, setSelectedCatId] = useState<string>(allCatsFilter);

  const load = useCallback(async () => {
    const [nextCats, nextItems, nextHistory] = await Promise.all([
      getCats(),
      getInventoryItems(),
      getPurchaseHistory(),
    ]);
    setCats(nextCats);
    setItems(nextItems);
    setHistory(nextHistory);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  useHouseholdSyncEvents(() => {
    void load();
  });

  const catNames = useMemo(() => new Map(cats.map((cat) => [cat.id, cat.name])), [cats]);
  const visibleItems = useMemo(
    () =>
      selectedCatId === allCatsFilter
        ? items
        : items.filter((item) => isInventoryItemForCat(item, selectedCatId)),
    [items, selectedCatId],
  );
  const visibleItemIds = useMemo(
    () => new Set(visibleItems.map((item) => item.id)),
    [visibleItems],
  );
  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const costRows = useMemo(
    () =>
      visibleItems
        .map((item) => ({
          item,
          cycleDays: calculateInventoryCycleDays(item),
          monthlyCost: calculateMonthlyCost(item),
        }))
        .sort((a, b) => (b.monthlyCost ?? -1) - (a.monthlyCost ?? -1)),
    [visibleItems],
  );
  const pricedRows = costRows.filter((row) => row.monthlyCost !== undefined);
  const monthlyEstimate = pricedRows.reduce((sum, row) => sum + (row.monthlyCost ?? 0), 0);
  const monthlyActual = history
    .filter((entry) => visibleItemIds.has(entry.inventoryItemId))
    .filter(
      (entry) => entry.price !== undefined && isSameMonth(parseISO(entry.purchasedAt), new Date()),
    )
    .reduce((sum, entry) => sum + (entry.price ?? 0), 0);
  const actualBreakdown = useMemo(
    () => buildActualBreakdown(history, visibleItemIds, itemById),
    [history, itemById, visibleItemIds],
  );
  const actualChartRows = useMemo(
    () =>
      actualBreakdown
        .map((row, index) => ({
          id: row.inventoryItemId,
          label: `${row.item.name}・${row.count}件`,
          amount: row.total,
          color: chartColors[index % chartColors.length],
        }))
        .filter((row) => row.amount > 0),
    [actualBreakdown],
  );
  const monthlyActualMissingPriceCount = history
    .filter((entry) => visibleItemIds.has(entry.inventoryItemId))
    .filter(
      (entry) => entry.price === undefined && isSameMonth(parseISO(entry.purchasedAt), new Date()),
    ).length;
  const yearlyEstimate = monthlyEstimate * 12;
  const categoryBreakdown = useMemo(() => buildCategoryBreakdown(costRows), [costRows]);

  return (
    <ScrollView
      contentContainerStyle={[styles.container, { paddingTop: Math.max(18, insets.top + 12) }]}
    >
      <View style={styles.header}>
        <Text style={styles.title}>費用ダッシュボード</Text>
        <Text style={styles.lead}>
          商品に設定した価格と使い切る周期から、月あたりの目安を表示します。
        </Text>
      </View>

      {cats.length > 1 ? (
        <View style={styles.catTabs}>
          <AppButton
            title="すべて"
            variant={selectedCatId === allCatsFilter ? 'primary' : 'secondary'}
            onPress={() => setSelectedCatId(allCatsFilter)}
            style={styles.catTab}
          />
          {cats.map((cat) => (
            <AppButton
              key={cat.id}
              title={cat.name}
              variant={selectedCatId === cat.id ? 'primary' : 'secondary'}
              onPress={() => setSelectedCatId(cat.id)}
              style={styles.catTab}
            />
          ))}
        </View>
      ) : null}

      <AppCard style={styles.card}>
        <Text style={styles.sectionTitle}>費用サマリー</Text>
        <View style={styles.summaryGrid}>
          <Summary
            label="月額目安"
            value={`${Math.round(monthlyEstimate).toLocaleString()}円`}
            tone="primary"
          />
          <Summary
            label="年額目安"
            value={`${Math.round(yearlyEstimate).toLocaleString()}円`}
            tone="normal"
          />
          <Summary label="今月の実績" value={`${monthlyActual.toLocaleString()}円`} tone="normal" />
        </View>
        <AppButton
          title="購入履歴を見る"
          variant="secondary"
          onPress={() => router.push('/purchase-history')}
        />
        <Text style={styles.note}>
          価格未入力、または使い切る周期を計算できない商品は目安から除外しています。
        </Text>
      </AppCard>

      <AppCard style={styles.card}>
        <Text style={styles.sectionTitle}>今月の実績内訳</Text>
        {actualChartRows.length > 0 ? (
          <CostDonutChart rows={actualChartRows} total={monthlyActual} centerLabel="今月実績" />
        ) : (
          <Text style={styles.note}>今月の価格入力済みの購入履歴はまだありません。</Text>
        )}
        {monthlyActualMissingPriceCount > 0 ? (
          <Text style={styles.note}>
            価格未入力の購入履歴 {monthlyActualMissingPriceCount}件は実績から除外しています。
          </Text>
        ) : null}
      </AppCard>

      {categoryBreakdown.length > 0 ? (
        <AppCard style={styles.card}>
          <Text style={styles.sectionTitle}>カテゴリ別の月額内訳</Text>
          <CostDonutChart rows={categoryBreakdown} total={monthlyEstimate} centerLabel="月額目安" />
        </AppCard>
      ) : null}

      {visibleItems.length === 0 ? (
        <EmptyState
          title="費用を表示できる商品がありません"
          message="商品登録で価格と残り日数の計算方法を設定すると、費用目安を確認できます。"
        />
      ) : (
        <View style={styles.list}>
          {costRows.map(({ item, cycleDays, monthlyCost }) => (
            <AppCard key={item.id} style={styles.itemCard}>
              <View style={styles.itemHeader}>
                <View style={styles.itemTitleWrap}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <Text style={styles.itemMeta}>
                    {[categoryLabels[item.category], getCatLabel(item, catNames)]
                      .filter(Boolean)
                      .join(' ・ ')}
                  </Text>
                </View>
                <Text style={styles.itemCost}>
                  {monthlyCost === undefined
                    ? '未計算'
                    : `${Math.round(monthlyCost).toLocaleString()}円/月`}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detail}>
                  価格：{item.price === undefined ? '未入力' : `${item.price.toLocaleString()}円`}
                </Text>
                <Text style={styles.detail}>
                  周期：{cycleDays === undefined ? '未計算' : `${cycleDays}日`}
                </Text>
              </View>
            </AppCard>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function Summary({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'primary' | 'normal' | 'warning';
}) {
  return (
    <View style={styles.summaryItem}>
      <Text
        style={[
          styles.summaryValue,
          tone === 'primary' && styles.primaryValue,
          tone === 'warning' && styles.warningValue,
        ]}
      >
        {value}
      </Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

type CostRow = {
  item: InventoryItem;
  cycleDays: number | undefined;
  monthlyCost: number | undefined;
};

type DonutChartRow = {
  id: string;
  label: string;
  amount: number;
  color: string;
};

type ActualBreakdownRow = {
  inventoryItemId: string;
  item: InventoryItem;
  count: number;
  total: number;
};

function CostDonutChart({
  rows,
  total,
  centerLabel,
}: {
  rows: DonutChartRow[];
  total: number;
  centerLabel: string;
}) {
  return (
    <View style={styles.chartWrap}>
      <View style={styles.donut}>
        {Array.from({ length: donutSegmentCount }).map((_, index) => {
          const color = getDonutSegmentColor(rows, total, index);
          return (
            <View
              key={index}
              style={[
                styles.donutSegmentWrap,
                { transform: [{ rotate: `${(360 / donutSegmentCount) * index}deg` }] },
              ]}
            >
              <View style={[styles.donutSegment, { backgroundColor: color }]} />
            </View>
          );
        })}
        <View style={styles.donutCenter}>
          <Text style={styles.donutTotal}>{Math.round(total).toLocaleString()}円</Text>
          <Text style={styles.donutLabel}>{centerLabel}</Text>
        </View>
      </View>
      <View style={styles.legend}>
        {rows.map((row) => (
          <View key={row.id} style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: row.color }]} />
            <Text style={styles.legendLabel}>{row.label}</Text>
            <Text style={styles.legendValue}>
              {Math.round(row.amount).toLocaleString()}円・{Math.round((row.amount / total) * 100)}%
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function buildCategoryBreakdown(rows: CostRow[]): DonutChartRow[] {
  const totals = new Map<InventoryCategory, number>();
  rows.forEach(({ item, monthlyCost }) => {
    if (monthlyCost === undefined) return;
    totals.set(item.category, (totals.get(item.category) ?? 0) + monthlyCost);
  });
  return Array.from(totals.entries())
    .filter(([, amount]) => amount > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([category, amount], index) => ({
      id: category,
      label: categoryLabels[category],
      amount,
      color: chartColors[index % chartColors.length],
    }));
}

function buildActualBreakdown(
  history: PurchaseHistory[],
  visibleItemIds: Set<string>,
  itemById: Map<string, InventoryItem>,
): ActualBreakdownRow[] {
  const rows = new Map<string, ActualBreakdownRow>();
  history
    .filter((entry) => visibleItemIds.has(entry.inventoryItemId))
    .filter(
      (entry) => entry.price !== undefined && isSameMonth(parseISO(entry.purchasedAt), new Date()),
    )
    .forEach((entry) => {
      const item = itemById.get(entry.inventoryItemId);
      if (!item) return;
      const current = rows.get(entry.inventoryItemId);
      rows.set(entry.inventoryItemId, {
        inventoryItemId: entry.inventoryItemId,
        item,
        count: (current?.count ?? 0) + 1,
        total: (current?.total ?? 0) + (entry.price ?? 0),
      });
    });

  return Array.from(rows.values()).sort((a, b) => b.total - a.total);
}

function getDonutSegmentColor(rows: DonutChartRow[], total: number, index: number): string {
  const ratio = (index + 0.5) / donutSegmentCount;
  let accumulated = 0;
  const row = rows.find((currentRow) => {
    accumulated += currentRow.amount / total;
    return ratio <= accumulated;
  });
  return row?.color ?? colors.border;
}

function getCatLabel(item: InventoryItem, catNames: Map<string, string>): string {
  return getInventoryCatIds(item)
    .map((catId) => catNames.get(catId))
    .filter(Boolean)
    .join('・');
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
    padding: 18,
    paddingBottom: 40,
  },
  header: {
    gap: 6,
  },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '900',
  },
  lead: {
    color: colors.subText,
    fontSize: 14,
    lineHeight: 20,
  },
  catTabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  catTab: {
    minWidth: 92,
  },
  card: {
    gap: 12,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  summaryItem: {
    backgroundColor: colors.muted,
    borderRadius: 8,
    flexGrow: 1,
    minWidth: 96,
    padding: 12,
  },
  summaryValue: {
    color: colors.text,
    fontSize: 21,
    fontWeight: '900',
  },
  primaryValue: {
    color: colors.primaryDark,
  },
  warningValue: {
    color: colors.warning,
  },
  summaryLabel: {
    color: colors.subText,
    fontSize: 12,
    marginTop: 4,
  },
  note: {
    color: colors.subText,
    fontSize: 12,
    lineHeight: 18,
  },
  chartWrap: {
    alignItems: 'center',
    gap: 16,
  },
  donut: {
    alignItems: 'center',
    height: 188,
    justifyContent: 'center',
    width: 188,
  },
  donutSegmentWrap: {
    height: 188,
    left: 0,
    position: 'absolute',
    top: 0,
    width: 188,
  },
  donutSegment: {
    borderRadius: 4,
    height: 76,
    left: 90,
    position: 'absolute',
    top: 8,
    width: 8,
  },
  donutCenter: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 54,
    borderWidth: 1,
    height: 108,
    justifyContent: 'center',
    padding: 10,
    width: 108,
  },
  donutTotal: {
    color: colors.primaryDark,
    fontSize: 17,
    fontWeight: '900',
    textAlign: 'center',
  },
  donutLabel: {
    color: colors.subText,
    fontSize: 11,
    marginTop: 4,
  },
  legend: {
    gap: 8,
    width: '100%',
  },
  legendRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  legendDot: {
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  legendLabel: {
    color: colors.text,
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
  },
  legendValue: {
    color: colors.subText,
    fontSize: 12,
    textAlign: 'right',
  },
  actualList: {
    gap: 10,
  },
  actualRow: {
    alignItems: 'flex-start',
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 12,
    paddingBottom: 10,
  },
  actualBody: {
    flex: 1,
    gap: 4,
  },
  actualName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  actualMeta: {
    color: colors.subText,
    fontSize: 12,
    lineHeight: 18,
  },
  actualAmount: {
    color: colors.primaryDark,
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'right',
  },
  list: {
    gap: 12,
  },
  itemCard: {
    gap: 10,
  },
  itemHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  itemTitleWrap: {
    flex: 1,
    gap: 4,
  },
  itemName: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  itemMeta: {
    color: colors.subText,
    fontSize: 12,
    lineHeight: 18,
  },
  itemCost: {
    color: colors.primaryDark,
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'right',
  },
  detailRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  detail: {
    color: colors.text,
    fontSize: 13,
  },
});
