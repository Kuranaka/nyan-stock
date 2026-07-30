import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { endOfDay, format, isAfter, isSameMonth, isValid, parseISO } from 'date-fns';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/AppButton';
import { AppCard } from '@/components/AppCard';
import { PetScopeSelector } from '@/components/PetScopeSelector';
import { colors } from '@/constants/colors';
import { getCats } from '@/features/cats/catStorage';
import { resolveSelectedCatId, toStoredCatId } from '@/features/cats/petSelection';
import { Cat } from '@/features/cats/catTypes';
import {
  calculateRemainingDays,
  getInventoryCatIds,
  isInventoryItemForCat,
  isPurchaseHistoryVisible,
  resolveEstimatedEndDate,
} from '@/features/inventory/inventoryLogic';
import { getInventoryItems, getPurchaseHistory } from '@/features/inventory/inventoryStorage';
import { InventoryItem, PurchaseHistory } from '@/features/inventory/inventoryTypes';
import { buildMonthlyCostAnalysis } from '@/features/inventory/monthlyCostAnalysis';
import { getSettings, updateSettings } from '@/features/settings/settingsStorage';
import { useHouseholdSyncEvents } from '@/features/sync/useHouseholdSyncEvents';

export default function CostDashboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [cats, setCats] = useState<Cat[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [history, setHistory] = useState<PurchaseHistory[]>([]);
  const [selectedCatId, setSelectedCatId] = useState<string | undefined>();

  const load = useCallback(async () => {
    const [nextCats, nextItems, nextHistory, settings] = await Promise.all([
      getCats(),
      getInventoryItems(),
      getPurchaseHistory(),
      getSettings(),
    ]);
    setCats(nextCats);
    setItems(nextItems);
    setHistory(nextHistory);
    setSelectedCatId(resolveSelectedCatId(nextCats, settings.selectedCatId));
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  useHouseholdSyncEvents(() => {
    void load();
  });

  const visibleItems = useMemo(
    () =>
      selectedCatId ? items.filter((item) => isInventoryItemForCat(item, selectedCatId)) : items,
    [items, selectedCatId],
  );
  const visibleItemIds = useMemo(
    () => new Set(visibleItems.map((item) => item.id)),
    [visibleItems],
  );
  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const { estimatedRows, excludedRows, monthlyEstimate } = useMemo(
    () => buildMonthlyCostAnalysis(visibleItems),
    [visibleItems],
  );
  const yearlyEstimate = monthlyEstimate * 12;
  const today = new Date();
  const currentMonthLabel = format(today, 'M月');

  const currentMonthHistory = useMemo(
    () =>
      history
        .filter((entry) => isPurchaseHistoryVisible(entry, selectedCatId, visibleItemIds))
        .filter((entry) => isCurrentMonthToDate(entry.purchasedAt)),
    [history, selectedCatId, visibleItemIds],
  );
  const pricedCurrentMonthHistory = currentMonthHistory.filter(
    (entry) => entry.price !== undefined,
  );
  const monthlyActual = pricedCurrentMonthHistory.reduce(
    (sum, entry) => sum + (entry.price ?? 0),
    0,
  );
  const monthlyActualMissingPriceCount =
    currentMonthHistory.length - pricedCurrentMonthHistory.length;
  const hasOnlyUnpricedActuals =
    currentMonthHistory.length > 0 && pricedCurrentMonthHistory.length === 0;
  const hasCompleteMonthlyEstimate =
    visibleItems.length > 0 && estimatedRows.length === visibleItems.length;
  const upcomingPurchaseRows = buildUpcomingPurchaseRows(visibleItems, today);
  const upcomingPurchaseTotal = upcomingPurchaseRows.reduce((sum, row) => sum + row.price, 0);
  const actualBreakdown = useMemo(
    () => buildActualBreakdown(pricedCurrentMonthHistory, itemById),
    [itemById, pricedCurrentMonthHistory],
  );
  const selectedPetHasSharedItems =
    selectedCatId !== undefined && visibleItems.some((item) => getInventoryCatIds(item).length > 1);

  async function selectCat(catId: string | undefined) {
    setSelectedCatId(catId);
    await updateSettings({ selectedCatId: toStoredCatId(catId) });
  }

  function openPurchaseHistory(filter?: 'missing-price') {
    router.push({
      pathname: '/purchase-history',
      params: {
        catId: toStoredCatId(selectedCatId),
        month: format(today, 'yyyy-MM'),
        ...(filter ? { filter } : {}),
      },
    });
  }

  function openMonthlyCostBreakdown() {
    router.push({
      pathname: '/monthly-cost-breakdown',
      params: { catId: toStoredCatId(selectedCatId) },
    });
  }

  const openItem = (id: string) => {
    router.push({ pathname: '/inventory-detail', params: { id } });
  };

  return (
    <ScrollView
      contentContainerStyle={[styles.container, { paddingTop: Math.max(18, insets.top + 12) }]}
    >
      <Text accessibilityRole="header" style={styles.title}>
        費用
      </Text>

      {cats.length > 0 ? (
        <View style={styles.filterSection}>
          <PetScopeSelector
            cats={cats}
            selectedCatId={selectedCatId}
            onSelect={(catId) => void selectCat(catId)}
          />
          {selectedPetHasSharedItems ? (
            <Text style={styles.note}>
              共有用品は、このペットに関連する用品として全額表示します。
            </Text>
          ) : null}
        </View>
      ) : null}

      <AppCard style={styles.heroCard}>
        <Text style={styles.heroLabel}>{currentMonthLabel}中に使った金額</Text>
        {monthlyActualMissingPriceCount > 0 ? (
          <Text style={styles.actualQualifier}>価格入力済み分</Text>
        ) : null}
        <Text style={styles.heroValue}>
          {hasOnlyUnpricedActuals ? '—' : formatCurrency(monthlyActual)}
        </Text>
        {monthlyActualMissingPriceCount > 0 ? (
          <Pressable
            accessibilityHint="価格未入力の購入履歴を表示します"
            accessibilityRole="button"
            onPress={() => openPurchaseHistory('missing-price')}
            style={({ pressed }) => [styles.missingPriceLink, pressed && styles.pressedRow]}
          >
            <Text style={styles.note}>
              購入記録{currentMonthHistory.length}件中{pricedCurrentMonthHistory.length}件を集計
            </Text>
            <Text style={styles.missingPriceLinkText}>
              価格未入力{monthlyActualMissingPriceCount}件を確認 ›
            </Text>
          </Pressable>
        ) : null}

        <View style={styles.estimatePanel}>
          <View style={styles.estimateHeader}>
            <Text style={styles.estimateLabel}>月額予測</Text>
            <Text style={styles.estimateValue}>
              {estimatedRows.length > 0 ? formatCurrency(monthlyEstimate) : '—'}
            </Text>
          </View>
          {hasCompleteMonthlyEstimate ? (
            <Text style={styles.yearlyText}>年換算 約{formatCurrency(yearlyEstimate)}</Text>
          ) : null}
          <Text style={styles.forecastScopeNote}>
            ※期間や価格の設定されていない用品は月額予測に含まれません。
          </Text>
          {estimatedRows.length > 0 || excludedRows.length > 0 ? (
            <Pressable
              accessibilityHint="月額予測の詳細画面を開きます"
              accessibilityLabel="月額予測の内訳を見る"
              accessibilityRole="button"
              onPress={openMonthlyCostBreakdown}
              style={({ pressed }) => [styles.estimateDetailsLink, pressed && styles.pressedRow]}
            >
              <Text style={styles.estimateDetailsLinkText}>内訳を見る</Text>
              <Text
                accessibilityElementsHidden
                importantForAccessibility="no"
                style={styles.estimateDetailsChevron}
              >
                ›
              </Text>
            </Pressable>
          ) : null}
        </View>

        <AppButton
          title="月別推移・購入履歴"
          variant="secondary"
          onPress={() => openPurchaseHistory()}
        />
      </AppCard>

      <AppCard style={styles.card}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>
          {monthlyActualMissingPriceCount > 0 ? '価格入力済み分の内訳' : '今月買ったもの'}
        </Text>
        {actualBreakdown.length > 0 ? (
          <View style={styles.barList}>
            {actualBreakdown.map((row) => (
              <ActualCostBar
                key={row.inventoryItemId}
                row={row}
                total={monthlyActual}
                onPress={row.item ? () => openItem(row.inventoryItemId) : undefined}
              />
            ))}
          </View>
        ) : (
          <Text style={styles.emptyText}>
            今月の購入記録はまだありません。補充を記録すると、ここに内訳が表示されます。
          </Text>
        )}
      </AppCard>

      {visibleItems.length === 0 ? (
        <AppCard style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>月額を予測できる用品がありません</Text>
          <Text style={styles.emptyText}>
            用品を登録すると、毎月かかる金額の目安を確認できます。
          </Text>
        </AppCard>
      ) : null}

      {upcomingPurchaseRows.length > 0 ? (
        <AppCard style={styles.card}>
          <View style={styles.upcomingHeader}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>
              今後30日の買い足し見込み
            </Text>
            <Text style={styles.upcomingTotal}>約{formatCurrency(upcomingPurchaseTotal)}</Text>
          </View>
          <Text style={styles.note}>次の買い足し時期と現在の価格から算出</Text>
          <View style={styles.itemList}>
            {upcomingPurchaseRows.map((row, index) => (
              <Pressable
                key={row.item.id}
                accessibilityHint="商品詳細を開きます"
                accessibilityLabel={`${row.item.name}、${formatUpcomingDate(row)}、約${formatCurrency(row.price)}`}
                accessibilityRole="button"
                onPress={() => openItem(row.item.id)}
                style={({ pressed }) => [
                  styles.upcomingRow,
                  index > 0 && styles.itemRowDivider,
                  pressed && styles.pressedRow,
                ]}
              >
                <View style={styles.upcomingDateBadge}>
                  <Text style={styles.upcomingDateText}>{formatUpcomingDate(row)}</Text>
                </View>
                <Text style={styles.upcomingName}>{row.item.name}</Text>
                <Text style={styles.upcomingPrice}>約{formatCurrency(row.price)}</Text>
                <Text
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                  style={styles.chevron}
                >
                  ›
                </Text>
              </Pressable>
            ))}
          </View>
        </AppCard>
      ) : null}
    </ScrollView>
  );
}

type ActualBreakdownRow = {
  inventoryItemId: string;
  itemName: string;
  item?: InventoryItem;
  count: number;
  total: number;
};

type UpcomingPurchaseRow = {
  item: InventoryItem;
  estimatedEndDate: string;
  remainingDays: number;
  price: number;
};

function ActualCostBar({
  row,
  total,
  onPress,
}: {
  row: ActualBreakdownRow;
  total: number;
  onPress?: () => void;
}) {
  const percentage = total > 0 ? Math.round((row.total / total) * 100) : 0;
  const barPercentage = Math.max(0, Math.min(100, percentage));
  const content = (
    <>
      <View style={styles.barHeader}>
        <View style={styles.actualNameWrap}>
          <Text style={styles.actualName}>{row.itemName}</Text>
          <Text style={styles.actualCount}>・{row.count}件</Text>
        </View>
        <Text style={styles.actualAmount}>
          {formatCurrency(row.total)}・{percentage}%
        </Text>
      </View>
      <View accessible={false} style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${barPercentage}%` }]} />
      </View>
      {!row.item ? <Text style={styles.deletedLabel}>削除済みの商品</Text> : null}
    </>
  );

  if (!onPress) return <View style={styles.actualRow}>{content}</View>;

  return (
    <Pressable
      accessibilityHint="商品詳細を開きます"
      accessibilityLabel={`${row.itemName}、${row.count}件、${formatCurrency(row.total)}、${percentage}%`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.actualRow, pressed && styles.pressedRow]}
    >
      {content}
    </Pressable>
  );
}

function buildActualBreakdown(
  history: PurchaseHistory[],
  itemById: Map<string, InventoryItem>,
): ActualBreakdownRow[] {
  const rows = new Map<string, ActualBreakdownRow>();
  history.forEach((entry) => {
    if (entry.price === undefined) return;
    const item = itemById.get(entry.inventoryItemId);
    const current = rows.get(entry.inventoryItemId);
    rows.set(entry.inventoryItemId, {
      inventoryItemId: entry.inventoryItemId,
      itemName: entry.itemName ?? item?.name ?? '削除済みの商品',
      item,
      count: (current?.count ?? 0) + 1,
      total: (current?.total ?? 0) + entry.price,
    });
  });
  return Array.from(rows.values()).sort((a, b) => b.total - a.total);
}

function buildUpcomingPurchaseRows(items: InventoryItem[], today: Date): UpcomingPurchaseRow[] {
  return items
    .map((item): UpcomingPurchaseRow | undefined => {
      const estimatedEndDate = resolveEstimatedEndDate(item);
      const remainingDays = calculateRemainingDays(item, today);
      if (
        item.price === undefined ||
        item.price < 0 ||
        !estimatedEndDate ||
        remainingDays === undefined ||
        remainingDays > 30
      ) {
        return undefined;
      }
      return { item, estimatedEndDate, remainingDays, price: item.price };
    })
    .filter((row): row is UpcomingPurchaseRow => Boolean(row))
    .sort((a, b) => a.remainingDays - b.remainingDays);
}

function formatUpcomingDate(row: UpcomingPurchaseRow): string {
  if (row.remainingDays <= 0) return '買い足し時期';
  if (row.remainingDays === 1) return '明日ごろ';
  return `${format(parseISO(row.estimatedEndDate), 'M月d日')}ごろ`;
}

function isCurrentMonthToDate(value: string): boolean {
  const date = parseISO(value);
  const today = new Date();
  return isValid(date) && isSameMonth(date, today) && !isAfter(date, endOfDay(today));
}

function formatCurrency(value: number): string {
  return `${Math.round(value).toLocaleString()}円`;
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
    padding: 18,
    paddingBottom: 40,
  },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '900',
  },
  filterSection: {
    gap: 8,
  },
  heroCard: {
    gap: 14,
  },
  heroLabel: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  heroValue: {
    color: colors.primaryDark,
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  actualQualifier: {
    color: colors.subText,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: -8,
  },
  estimatePanel: {
    backgroundColor: colors.muted,
    borderRadius: 12,
    gap: 6,
    padding: 14,
  },
  estimateHeader: {
    alignItems: 'baseline',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
  },
  estimateLabel: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  estimateValue: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '900',
  },
  estimateDescription: {
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
    fontSize: 15,
  },
  forecastScopeNote: {
    color: colors.subText,
    fontSize: 11,
    lineHeight: 17,
  },
  estimateDetailsLink: {
    alignItems: 'center',
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    minHeight: 48,
    paddingTop: 8,
  },
  estimateDetailsLinkText: {
    color: colors.primaryDark,
    fontSize: 15,
    fontWeight: '800',
  },
  estimateDetailsChevron: {
    color: colors.primaryDark,
    fontSize: 24,
    lineHeight: 28,
  },
  card: {
    gap: 14,
  },
  upcomingHeader: {
    alignItems: 'baseline',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
  },
  upcomingTotal: {
    color: colors.primaryDark,
    fontSize: 18,
    fontWeight: '900',
  },
  upcomingRow: {
    alignItems: 'center',
    borderRadius: 10,
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: -6,
    minHeight: 60,
    paddingHorizontal: 6,
    paddingVertical: 10,
  },
  upcomingDateBadge: {
    backgroundColor: colors.primaryLight,
    borderRadius: 9,
    minWidth: 72,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  upcomingDateText: {
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  upcomingName: {
    color: colors.text,
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
  },
  upcomingPrice: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
  },
  sectionTitle: {
    color: colors.text,
    flex: 1,
    fontSize: 17,
    fontWeight: '800',
  },
  note: {
    color: colors.subText,
    fontSize: 12,
    lineHeight: 18,
  },
  missingPriceLink: {
    alignItems: 'flex-start',
    borderRadius: 10,
    gap: 2,
    marginHorizontal: -6,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  missingPriceLinkText: {
    color: colors.primaryDark,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 19,
  },
  barList: {
    gap: 14,
  },
  actualRow: {
    borderRadius: 10,
    gap: 7,
    marginHorizontal: -6,
    minHeight: 44,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  barHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  actualNameWrap: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  actualName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  actualCount: {
    color: colors.subText,
    fontSize: 13,
  },
  actualAmount: {
    color: colors.subText,
    fontSize: 13,
    textAlign: 'right',
  },
  barTrack: {
    backgroundColor: colors.primaryLight,
    borderRadius: 4,
    height: 8,
    overflow: 'hidden',
  },
  barFill: {
    backgroundColor: colors.primary,
    borderRadius: 4,
    height: 8,
  },
  deletedLabel: {
    color: colors.subText,
    fontSize: 11,
  },
  itemList: {
    marginBottom: -4,
  },
  itemRowDivider: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
  },
  pressedRow: {
    backgroundColor: colors.muted,
  },
  chevron: {
    color: colors.subText,
    fontSize: 26,
    lineHeight: 28,
  },
  emptyCard: {
    gap: 6,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  emptyText: {
    color: colors.subText,
    fontSize: 13,
    lineHeight: 20,
  },
});
