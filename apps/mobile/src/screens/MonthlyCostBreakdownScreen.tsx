import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { AppCard } from '@/components/AppCard';
import { EmptyState } from '@/components/EmptyState';
import { PetScopeSelector } from '@/components/PetScopeSelector';
import { colors } from '@/constants/colors';
import { getCats } from '@/features/cats/catStorage';
import { resolveSelectedCatId, toStoredCatId } from '@/features/cats/petSelection';
import { Cat } from '@/features/cats/catTypes';
import { getInventoryCatIds, isInventoryItemForCat } from '@/features/inventory/inventoryLogic';
import { getInventoryItems } from '@/features/inventory/inventoryStorage';
import { InventoryItem } from '@/features/inventory/inventoryTypes';
import {
  buildMonthlyCostAnalysis,
  buildMonthlyCostChartRows,
  getMonthlyCostExclusionReason,
} from '@/features/inventory/monthlyCostAnalysis';
import { getSettings, updateSettings } from '@/features/settings/settingsStorage';
import { useHouseholdSyncEvents } from '@/features/sync/useHouseholdSyncEvents';

export default function MonthlyCostBreakdownScreen() {
  const router = useRouter();
  const { catId: routeCatId } = useLocalSearchParams<{ catId?: string }>();
  const [cats, setCats] = useState<Cat[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [selectedCatId, setSelectedCatId] = useState<string | undefined>();
  const [showAllExcludedItems, setShowAllExcludedItems] = useState(false);

  const load = useCallback(async () => {
    const [nextCats, nextItems, settings] = await Promise.all([
      getCats(),
      getInventoryItems(),
      getSettings(),
    ]);
    setCats(nextCats);
    setItems(nextItems);
    setSelectedCatId(resolveSelectedCatId(nextCats, routeCatId ?? settings.selectedCatId));
  }, [routeCatId]);

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
      selectedCatId ? items.filter((item) => isInventoryItemForCat(item, selectedCatId)) : items,
    [items, selectedCatId],
  );
  const { estimatedRows, excludedRows, monthlyEstimate } = useMemo(
    () => buildMonthlyCostAnalysis(visibleItems),
    [visibleItems],
  );
  const chartRows = useMemo(() => buildMonthlyCostChartRows(estimatedRows), [estimatedRows]);
  const visibleExcludedRows = showAllExcludedItems ? excludedRows : excludedRows.slice(0, 3);
  const hasCompleteMonthlyEstimate =
    visibleItems.length > 0 && estimatedRows.length === visibleItems.length;
  const selectedPetHasSharedItems =
    selectedCatId !== undefined && visibleItems.some((item) => getInventoryCatIds(item).length > 1);

  async function selectCat(catId: string | undefined) {
    const storedCatId = toStoredCatId(catId);
    setSelectedCatId(catId);
    setShowAllExcludedItems(false);
    await updateSettings({ selectedCatId: storedCatId });
    router.setParams({ catId: storedCatId });
  }

  function openItem(id: string) {
    router.push({ pathname: '/inventory-detail', params: { id } });
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <PetScopeSelector
        cats={cats}
        selectedCatId={selectedCatId}
        onSelect={(catId) => void selectCat(catId)}
      />

      <AppCard style={styles.summaryCard}>
        <Text style={styles.summaryLabel}>月額予測</Text>
        <Text style={styles.summaryValue}>
          {estimatedRows.length > 0 ? formatCurrency(monthlyEstimate) : '—'}
        </Text>
        <Text style={styles.summaryDescription}>現在の価格と周期から30日分を算出</Text>
        <Text style={styles.coverageText}>
          {visibleItems.length > 0
            ? `${visibleItems.length}用品中${estimatedRows.length}用品から算出`
            : '月額予測の対象用品はありません'}
        </Text>
        {hasCompleteMonthlyEstimate ? (
          <Text style={styles.yearlyText}>年換算 約{formatCurrency(monthlyEstimate * 12)}</Text>
        ) : null}
        <Text style={styles.forecastScopeNote}>
          ※期間や価格の設定されていない用品は月額予測に含まれません。
        </Text>
        {selectedPetHasSharedItems ? (
          <Text style={styles.sharedItemNote}>
            共有用品は、このペットに関連する用品として全額表示します。
          </Text>
        ) : null}
      </AppCard>

      {estimatedRows.length > 0 ? (
        <AppCard style={styles.card}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            用品別の月額予測
          </Text>
          <Text style={styles.note}>月額予測全体に占める割合</Text>
          <View style={styles.chart}>
            {chartRows.map((row) => {
              const roundedPercentage = Math.round(row.percentage);
              const barPercentage = Math.max(0, Math.min(100, row.percentage));
              return (
                <View
                  key={row.id}
                  accessible
                  accessibilityLabel={`${row.label}、月額${formatCurrency(row.monthlyCost)}、全体の${roundedPercentage}パーセント`}
                  style={styles.chartRow}
                >
                  <View style={styles.chartRowHeader}>
                    <Text style={styles.chartLabel}>{row.label}</Text>
                    <Text style={styles.chartValue}>
                      {formatCurrency(row.monthlyCost)}・{roundedPercentage}%
                    </Text>
                  </View>
                  <View accessible={false} style={styles.chartTrack}>
                    <View
                      style={[
                        styles.chartFill,
                        {
                          minWidth: row.monthlyCost > 0 ? 2 : 0,
                          width: `${barPercentage}%`,
                        },
                      ]}
                    />
                  </View>
                </View>
              );
            })}
          </View>
        </AppCard>
      ) : visibleItems.length > 0 ? (
        <AppCard style={styles.card}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            用品別の月額予測
          </Text>
          <Text style={styles.emptyText}>
            価格や使用周期を登録すると、用品ごとの月額予測を表示できます。
          </Text>
        </AppCard>
      ) : null}

      {estimatedRows.length > 0 ? (
        <AppCard style={styles.card}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            すべての内訳
          </Text>
          <View style={styles.itemList}>
            {estimatedRows.map(({ item, cycleDays, monthlyCost }, index) => {
              const percentage = monthlyEstimate > 0 ? (monthlyCost / monthlyEstimate) * 100 : 0;
              const roundedPercentage = Math.round(percentage);
              const catLabel = getCatLabel(item, catNames);
              const itemMeta = [catLabel, cycleDays ? `${cycleDays}日周期` : undefined]
                .filter(Boolean)
                .join(' ・ ');
              return (
                <Pressable
                  key={item.id}
                  accessibilityHint="商品詳細を開きます"
                  accessibilityLabel={`${item.name}、月額${formatCurrency(monthlyCost)}、全体の${roundedPercentage}パーセント${itemMeta ? `、${itemMeta}` : ''}`}
                  accessibilityRole="button"
                  onPress={() => openItem(item.id)}
                  style={({ pressed }) => [
                    styles.itemRow,
                    index > 0 && styles.itemRowDivider,
                    pressed && styles.pressedRow,
                  ]}
                >
                  <View style={styles.itemBody}>
                    <View style={styles.itemHeading}>
                      <Text style={styles.itemName}>{item.name}</Text>
                      <Text style={styles.itemCost}>{formatCurrency(monthlyCost)}/月</Text>
                    </View>
                    {itemMeta ? <Text style={styles.itemMeta}>{itemMeta}</Text> : null}
                    <Text style={styles.itemPercentage}>全体の{roundedPercentage}%</Text>
                  </View>
                  <Text
                    accessibilityElementsHidden
                    importantForAccessibility="no"
                    style={styles.chevron}
                  >
                    ›
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </AppCard>
      ) : null}

      {excludedRows.length > 0 ? (
        <AppCard style={styles.card}>
          <View style={styles.sectionHeadingRow}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>
              月額予測に含まれない用品
            </Text>
            <Text style={styles.sectionCount}>{excludedRows.length}件</Text>
          </View>
          <View style={styles.itemList}>
            {visibleExcludedRows.map(({ item, cycleDays }, index) => {
              const reason = getMonthlyCostExclusionReason(item, cycleDays);
              return (
                <Pressable
                  key={item.id}
                  accessibilityHint="商品詳細を開きます"
                  accessibilityLabel={`${item.name}、${reason.label}、${reason.detail}`}
                  accessibilityRole="button"
                  onPress={() => openItem(item.id)}
                  style={({ pressed }) => [
                    styles.excludedRow,
                    index > 0 && styles.itemRowDivider,
                    pressed && styles.pressedRow,
                  ]}
                >
                  <View style={styles.itemBody}>
                    <Text style={styles.itemName}>{item.name}</Text>
                    <Text style={styles.reasonLabel}>{reason.label}</Text>
                    <Text style={styles.reasonDetail}>{reason.detail}</Text>
                  </View>
                  <Text
                    accessibilityElementsHidden
                    importantForAccessibility="no"
                    style={styles.chevron}
                  >
                    ›
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {excludedRows.length > 3 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: showAllExcludedItems }}
              onPress={() => setShowAllExcludedItems((current) => !current)}
              style={({ pressed }) => [styles.expandExcludedButton, pressed && styles.pressedRow]}
            >
              <Text style={styles.expandExcludedText}>
                {showAllExcludedItems ? '閉じる' : `ほか${excludedRows.length - 3}件を見る`}
              </Text>
            </Pressable>
          ) : null}
        </AppCard>
      ) : null}

      {visibleItems.length === 0 ? (
        <EmptyState
          title="用品がありません"
          message="用品を登録すると、毎月かかる金額の目安を確認できます。"
        />
      ) : null}
    </ScrollView>
  );
}

function formatCurrency(value: number): string {
  return `${Math.round(value).toLocaleString()}円`;
}

function getCatLabel(item: InventoryItem, catNames: Map<string, string>): string {
  return getInventoryCatIds(item)
    .map((catId) => catNames.get(catId))
    .filter(Boolean)
    .join('・');
}

const styles = StyleSheet.create({
  container: {
    gap: 14,
    padding: 18,
    paddingBottom: 40,
  },
  summaryCard: {
    gap: 7,
  },
  summaryLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  summaryValue: {
    color: colors.primaryDark,
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  summaryDescription: {
    color: colors.subText,
    fontSize: 12,
    lineHeight: 18,
  },
  coverageText: {
    color: colors.subText,
    fontSize: 13,
    lineHeight: 19,
  },
  yearlyText: {
    color: colors.subText,
    fontSize: 12,
  },
  forecastScopeNote: {
    color: colors.subText,
    fontSize: 11,
    lineHeight: 17,
  },
  sharedItemNote: {
    backgroundColor: colors.muted,
    borderRadius: 10,
    color: colors.subText,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
    padding: 10,
  },
  card: {
    gap: 12,
  },
  sectionHeadingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: colors.text,
    flex: 1,
    fontSize: 17,
    fontWeight: '800',
  },
  sectionCount: {
    color: colors.subText,
    fontSize: 13,
    fontWeight: '700',
  },
  note: {
    color: colors.subText,
    fontSize: 12,
    lineHeight: 18,
  },
  chart: {
    gap: 14,
    marginTop: 2,
  },
  chartRow: {
    gap: 7,
  },
  chartRowHeader: {
    alignItems: 'baseline',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
  },
  chartLabel: {
    color: colors.text,
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
    minWidth: 150,
  },
  chartValue: {
    color: colors.subText,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
  },
  chartTrack: {
    backgroundColor: colors.primaryLight,
    borderRadius: 5,
    height: 10,
    overflow: 'hidden',
  },
  chartFill: {
    backgroundColor: colors.primary,
    borderRadius: 5,
    height: 10,
  },
  itemList: {
    marginBottom: -4,
  },
  itemRow: {
    alignItems: 'center',
    borderRadius: 10,
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: -6,
    minHeight: 72,
    paddingHorizontal: 6,
    paddingVertical: 12,
  },
  excludedRow: {
    alignItems: 'center',
    borderRadius: 10,
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: -6,
    minHeight: 76,
    paddingHorizontal: 6,
    paddingVertical: 12,
  },
  itemRowDivider: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
  },
  pressedRow: {
    backgroundColor: colors.muted,
  },
  itemBody: {
    flex: 1,
    gap: 3,
  },
  itemHeading: {
    alignItems: 'baseline',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
  },
  itemName: {
    color: colors.text,
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
    minWidth: 150,
  },
  itemCost: {
    color: colors.primaryDark,
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 20,
  },
  itemMeta: {
    color: colors.subText,
    fontSize: 12,
    lineHeight: 18,
  },
  itemPercentage: {
    color: colors.subText,
    fontSize: 12,
    lineHeight: 18,
  },
  chevron: {
    color: colors.subText,
    fontSize: 24,
    lineHeight: 28,
  },
  reasonLabel: {
    color: colors.neutral,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 19,
  },
  reasonDetail: {
    color: colors.subText,
    fontSize: 12,
    lineHeight: 18,
  },
  expandExcludedButton: {
    alignSelf: 'center',
    borderRadius: 10,
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  expandExcludedText: {
    color: colors.primaryDark,
    fontSize: 13,
    fontWeight: '800',
  },
  emptyText: {
    color: colors.subText,
    fontSize: 13,
    lineHeight: 20,
  },
});
