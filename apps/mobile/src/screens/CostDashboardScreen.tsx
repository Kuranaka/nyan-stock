import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { isSameMonth, parseISO } from 'date-fns';
import { useFocusEffect } from 'expo-router';

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
import { InventoryItem, PurchaseHistory } from '@/features/inventory/inventoryTypes';

const allCatsFilter = 'all';

export default function CostDashboardScreen() {
  const [cats, setCats] = useState<Cat[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [history, setHistory] = useState<PurchaseHistory[]>([]);
  const [selectedCatId, setSelectedCatId] = useState<string>(allCatsFilter);

  useFocusEffect(
    useCallback(() => {
      async function load() {
        const [nextCats, nextItems, nextHistory] = await Promise.all([
          getCats(),
          getInventoryItems(),
          getPurchaseHistory(),
        ]);
        setCats(nextCats);
        setItems(nextItems);
        setHistory(nextHistory);
      }
      void load();
    }, []),
  );

  const catNames = useMemo(() => new Map(cats.map((cat) => [cat.id, cat.name])), [cats]);
  const visibleItems = useMemo(
    () =>
      selectedCatId === allCatsFilter
        ? items
        : items.filter((item) => isInventoryItemForCat(item, selectedCatId)),
    [items, selectedCatId],
  );
  const visibleItemIds = useMemo(() => new Set(visibleItems.map((item) => item.id)), [visibleItems]);
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
  const missingPriceCount = visibleItems.filter((item) => item.price === undefined).length;
  const missingCycleCount = visibleItems.filter((item) => item.price !== undefined && calculateInventoryCycleDays(item) === undefined).length;
  const monthlyEstimate = pricedRows.reduce((sum, row) => sum + (row.monthlyCost ?? 0), 0);
  const monthlyActual = history
    .filter((entry) => visibleItemIds.has(entry.inventoryItemId))
    .filter((entry) => entry.price !== undefined && isSameMonth(parseISO(entry.purchasedAt), new Date()))
    .reduce((sum, entry) => sum + (entry.price ?? 0), 0);
  const yearlyEstimate = monthlyEstimate * 12;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>費用ダッシュボード</Text>
        <Text style={styles.lead}>商品に設定した価格と使い切る周期から、月あたりの目安を表示します。</Text>
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
          <Summary label="月額目安" value={`${Math.round(monthlyEstimate).toLocaleString()}円`} tone="primary" />
          <Summary label="年額目安" value={`${Math.round(yearlyEstimate).toLocaleString()}円`} tone="normal" />
          <Summary label="今月の実績" value={`${monthlyActual.toLocaleString()}円`} tone="normal" />
        </View>
        <Text style={styles.note}>価格未入力、または使い切る周期を計算できない商品は目安から除外しています。</Text>
      </AppCard>

      <AppCard style={styles.card}>
        <Text style={styles.sectionTitle}>登録状況</Text>
        <View style={styles.summaryGrid}>
          <Summary label="対象商品" value={`${visibleItems.length}件`} tone="normal" />
          <Summary label="価格未入力" value={`${missingPriceCount}件`} tone="warning" />
          <Summary label="周期未計算" value={`${missingCycleCount}件`} tone="warning" />
        </View>
      </AppCard>

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
                    {[categoryLabels[item.category], getCatLabel(item, catNames)].filter(Boolean).join(' ・ ')}
                  </Text>
                </View>
                <Text style={styles.itemCost}>
                  {monthlyCost === undefined ? '未計算' : `${Math.round(monthlyCost).toLocaleString()}円/月`}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detail}>
                  価格：{item.price === undefined ? '未入力' : `${item.price.toLocaleString()}円`}
                </Text>
                <Text style={styles.detail}>周期：{cycleDays === undefined ? '未計算' : `${cycleDays}日`}</Text>
              </View>
            </AppCard>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function Summary({ label, value, tone }: { label: string; value: string; tone: 'primary' | 'normal' | 'warning' }) {
  return (
    <View style={styles.summaryItem}>
      <Text style={[styles.summaryValue, tone === 'primary' && styles.primaryValue, tone === 'warning' && styles.warningValue]}>
        {value}
      </Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
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
