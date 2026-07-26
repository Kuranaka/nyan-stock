import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { addMonths, format, getDate, getDaysInMonth, isValid, parseISO, subMonths } from 'date-fns';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { AppButton } from '@/components/AppButton';
import { AppCard } from '@/components/AppCard';
import { AppTextInput } from '@/components/AppTextInput';
import { EmptyState } from '@/components/EmptyState';
import { PetScopeSelector } from '@/components/PetScopeSelector';
import { unitLabels } from '@/constants/categories';
import { colors } from '@/constants/colors';
import { getCats } from '@/features/cats/catStorage';
import { resolveSelectedCatId, toStoredCatId } from '@/features/cats/petSelection';
import { Cat } from '@/features/cats/catTypes';
import {
  getInventoryCatIds,
  isInventoryItemForCat,
  isPurchaseHistoryVisible,
} from '@/features/inventory/inventoryLogic';
import {
  deletePurchaseHistory,
  getInventoryItems,
  getPurchaseHistory,
  updatePurchaseHistoryPrice,
} from '@/features/inventory/inventoryStorage';
import { InventoryItem, PurchaseHistory } from '@/features/inventory/inventoryTypes';
import { scheduleInventoryNotifications } from '@/features/notifications/notificationService';
import { getSettings, updateSettings } from '@/features/settings/settingsStorage';
import { useHouseholdSyncEvents } from '@/features/sync/useHouseholdSyncEvents';
import { formatDisplayDate } from '@/utils/date';

export default function PurchaseHistoryScreen() {
  const router = useRouter();
  const {
    catId: routeCatId,
    filter: routeFilter,
    month: routeMonth,
  } = useLocalSearchParams<{
    catId?: string;
    filter?: string;
    month?: string;
  }>();
  const [history, setHistory] = useState<PurchaseHistory[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [cats, setCats] = useState<Cat[]>([]);
  const [selectedCatId, setSelectedCatId] = useState<string | undefined>();
  const [selectedMonth, setSelectedMonth] = useState<string | undefined>();
  const [editingHistoryId, setEditingHistoryId] = useState<string | undefined>();
  const [editingPrice, setEditingPrice] = useState('');
  const [savingHistoryPrice, setSavingHistoryPrice] = useState(false);
  const [deletingHistoryId, setDeletingHistoryId] = useState<string | undefined>();

  const load = useCallback(async () => {
    const [nextHistory, nextItems, nextCats, settings] = await Promise.all([
      getPurchaseHistory(),
      getInventoryItems(),
      getCats(),
      getSettings(),
    ]);
    setHistory(nextHistory);
    setItems(nextItems);
    setCats(nextCats);
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

  const itemNames = useMemo(() => new Map(items.map((item) => [item.id, item.name])), [items]);
  const catNames = useMemo(() => new Map(cats.map((cat) => [cat.id, cat.name])), [cats]);
  const itemCatNames = useMemo(
    () =>
      new Map(
        items.map((item) => [
          item.id,
          getInventoryCatIds(item)
            .map((catId) => catNames.get(catId))
            .filter(Boolean)
            .join('・'),
        ]),
      ),
    [catNames, items],
  );
  const visibleItems = useMemo(
    () =>
      selectedCatId ? items.filter((item) => isInventoryItemForCat(item, selectedCatId)) : items,
    [items, selectedCatId],
  );
  const visibleItemIds = useMemo(
    () => new Set(visibleItems.map((item) => item.id)),
    [visibleItems],
  );
  const visibleHistory = useMemo(
    () => history.filter((entry) => isPurchaseHistoryVisible(entry, selectedCatId, visibleItemIds)),
    [history, selectedCatId, visibleItemIds],
  );
  const currentMonth = format(new Date(), 'yyyy-MM');
  const activeMonth = selectedMonth ?? normalizeMonthKey(routeMonth) ?? currentMonth;
  const activeMonthDate = parseISO(`${activeMonth}-01`);
  const activeMonthLabel = format(activeMonthDate, 'yyyy年M月');
  const selectedMonthCutoffDay = activeMonth === currentMonth ? getDate(new Date()) : undefined;
  const filteredHistory = getHistoryForMonth(visibleHistory, activeMonth, selectedMonthCutoffDay);
  const pricedFilteredHistory = filteredHistory.filter((entry) => entry.price !== undefined);
  const monthlyTotal = pricedFilteredHistory.reduce((sum, entry) => sum + (entry.price ?? 0), 0);
  const monthlyMissingPriceCount = filteredHistory.length - pricedFilteredHistory.length;
  const hasOnlyUnpricedHistory = filteredHistory.length > 0 && pricedFilteredHistory.length === 0;
  const showMissingPriceOnly = routeFilter === 'missing-price';
  const displayedHistory = showMissingPriceOnly
    ? filteredHistory.filter((entry) => entry.price === undefined)
    : filteredHistory;
  const oldestVisibleMonth = getOldestMonth(visibleHistory, currentMonth);
  const canGoPrevious = Boolean(oldestVisibleMonth && activeMonth > oldestVisibleMonth);
  const canGoNext = activeMonth < currentMonth;
  const previousMonth = format(subMonths(activeMonthDate, 1), 'yyyy-MM');
  const previousMonthHistory = getHistoryForMonth(
    visibleHistory,
    previousMonth,
    activeMonth === currentMonth ? getDate(new Date()) : undefined,
  );
  const previousMonthPricedHistory = previousMonthHistory.filter(
    (entry) => entry.price !== undefined,
  );
  const previousMonthActual = previousMonthPricedHistory.reduce(
    (sum, entry) => sum + (entry.price ?? 0),
    0,
  );
  const hasEarlierPricedHistory = visibleHistory.some((entry) => {
    const entryMonth = monthKeyOf(entry.purchasedAt);
    return entry.price !== undefined && entryMonth !== '' && entryMonth < activeMonth;
  });
  const canCompareWithPreviousMonth =
    pricedFilteredHistory.length > 0 && previousMonthPricedHistory.length > 0;
  const monthOverMonthDifference = monthlyTotal - previousMonthActual;
  const monthOverMonthRate =
    previousMonthActual > 0 ? (monthOverMonthDifference / previousMonthActual) * 100 : undefined;
  const monthlyTrend = useMemo(
    () => buildMonthlyTrend(visibleHistory, activeMonth),
    [activeMonth, visibleHistory],
  );
  const monthsWithPricedHistory = monthlyTrend.filter((month) => month.pricedCount > 0);
  const recordedMonthAverage =
    monthsWithPricedHistory.length >= 2
      ? monthsWithPricedHistory.reduce((sum, month) => sum + month.total, 0) /
        monthsWithPricedHistory.length
      : undefined;
  const comparisonMessage = getComparisonMessage({
    hasCurrentPrice: pricedFilteredHistory.length > 0,
    hasEarlierPricedHistory,
    hasPreviousPrice: previousMonthPricedHistory.length > 0,
  });

  async function selectCat(catId: string | undefined) {
    setSelectedCatId(catId);
    const storedCatId = toStoredCatId(catId);
    await updateSettings({ selectedCatId: storedCatId });
    router.setParams({ catId: storedCatId });
  }

  function moveMonth(offset: -1 | 1) {
    const nextMonth = format(addMonths(activeMonthDate, offset), 'yyyy-MM');
    setSelectedMonth(nextMonth);
    setEditingHistoryId(undefined);
    setEditingPrice('');
    router.setParams({ month: nextMonth });
  }

  function setMissingPriceFilter(enabled: boolean) {
    setEditingHistoryId(undefined);
    setEditingPrice('');
    router.setParams({ filter: enabled ? 'missing-price' : 'all' });
  }

  function startEditingPrice(entry: PurchaseHistory) {
    setEditingHistoryId(entry.id);
    setEditingPrice(entry.price !== undefined ? String(entry.price) : '');
  }

  function cancelEditingPrice() {
    if (savingHistoryPrice) return;
    setEditingHistoryId(undefined);
    setEditingPrice('');
  }

  async function saveEditingPrice() {
    if (!editingHistoryId || savingHistoryPrice) return;
    const normalizedPrice = editingPrice.trim();
    const parsedPrice = normalizedPrice ? Number(normalizedPrice) : undefined;

    if (parsedPrice !== undefined && (!Number.isFinite(parsedPrice) || parsedPrice < 0)) {
      Alert.alert('価格を確認してください', '価格は0以上の数字で入力してください。');
      return;
    }

    setSavingHistoryPrice(true);
    try {
      const nextHistory = await updatePurchaseHistoryPrice(editingHistoryId, parsedPrice);
      setHistory(nextHistory);
      setEditingHistoryId(undefined);
      setEditingPrice('');
    } catch (error) {
      Alert.alert(
        '保存できませんでした',
        error instanceof Error ? error.message : '時間をおいてもう一度お試しください。',
      );
    } finally {
      setSavingHistoryPrice(false);
    }
  }

  function confirmDeleteHistory(entry: PurchaseHistory) {
    if (deletingHistoryId) return;
    Alert.alert(
      '購入履歴を削除しますか？',
      `${formatDisplayDate(entry.purchasedAt)}の購入履歴を削除します。`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除する',
          style: 'destructive',
          onPress: async () => {
            setDeletingHistoryId(entry.id);
            let nextHistory: PurchaseHistory[];
            try {
              nextHistory = await deletePurchaseHistory(entry.id);
            } catch (error) {
              Alert.alert(
                '削除できませんでした',
                error instanceof Error ? error.message : '時間をおいてもう一度お試しください。',
              );
              setDeletingHistoryId(undefined);
              return;
            }

            setHistory(nextHistory);
            if (editingHistoryId === entry.id) {
              setEditingHistoryId(undefined);
              setEditingPrice('');
            }

            try {
              const nextItems = await getInventoryItems();
              setItems(nextItems);
              const settings = await getSettings();
              await scheduleInventoryNotifications(nextItems, settings);
            } catch {
              Alert.alert(
                '購入履歴を削除しました',
                '通知を更新できませんでした。アプリを開き直すと再調整されます。',
              );
            }
            setDeletingHistoryId(undefined);
          },
        },
      ],
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <PetScopeSelector
        cats={cats}
        selectedCatId={selectedCatId}
        onSelect={(catId) => void selectCat(catId)}
      />

      <AppCard style={styles.summaryCard}>
        <View style={styles.monthNavigator}>
          <Pressable
            accessibilityLabel="前の月"
            accessibilityRole="button"
            accessibilityState={{ disabled: !canGoPrevious }}
            disabled={!canGoPrevious}
            onPress={() => moveMonth(-1)}
            style={({ pressed }) => [
              styles.monthMoveButton,
              !canGoPrevious && styles.disabledButton,
              pressed && canGoPrevious && styles.pressed,
            ]}
          >
            <Text style={styles.monthMoveText}>‹</Text>
          </Pressable>
          <Text accessibilityRole="header" style={styles.monthLabel}>
            {activeMonthLabel}
          </Text>
          <Pressable
            accessibilityLabel="次の月"
            accessibilityRole="button"
            accessibilityState={{ disabled: !canGoNext }}
            disabled={!canGoNext}
            onPress={() => moveMonth(1)}
            style={({ pressed }) => [
              styles.monthMoveButton,
              !canGoNext && styles.disabledButton,
              pressed && canGoNext && styles.pressed,
            ]}
          >
            <Text style={styles.monthMoveText}>›</Text>
          </Pressable>
        </View>
        <Text style={styles.summaryLabel}>この月に使った金額</Text>
        <Text style={styles.totalValue}>
          {hasOnlyUnpricedHistory ? '—' : `${monthlyTotal.toLocaleString()}円`}
        </Text>
        {monthlyMissingPriceCount > 0 ? (
          <Text style={styles.note}>
            購入記録{filteredHistory.length}件中{pricedFilteredHistory.length}件を集計
          </Text>
        ) : filteredHistory.length === 0 ? (
          <Text style={styles.note}>この月の購入記録はありません。</Text>
        ) : null}
      </AppCard>

      {monthlyMissingPriceCount > 0 || showMissingPriceOnly ? (
        <View style={styles.listFilterRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: showMissingPriceOnly }}
            onPress={() => setMissingPriceFilter(true)}
            style={({ pressed }) => [
              styles.missingPriceFilter,
              showMissingPriceOnly && styles.missingPriceFilterSelected,
              pressed && styles.pressed,
            ]}
          >
            <Text
              style={[
                styles.missingPriceFilterText,
                showMissingPriceOnly && styles.missingPriceFilterTextSelected,
              ]}
            >
              {showMissingPriceOnly ? '✓ ' : ''}価格未入力のみ {monthlyMissingPriceCount}件
            </Text>
          </Pressable>
          {showMissingPriceOnly ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setMissingPriceFilter(false)}
              style={({ pressed }) => [styles.showAllHistoryButton, pressed && styles.pressed]}
            >
              <Text style={styles.showAllHistoryText}>すべて表示</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {visibleHistory.length > 0 && !showMissingPriceOnly ? (
        <AppCard style={styles.trendCard}>
          <Text style={styles.sectionTitle}>{activeMonthLabel}までの費用推移</Text>
          {canCompareWithPreviousMonth || recordedMonthAverage !== undefined ? (
            <View style={styles.comparisonGrid}>
              {canCompareWithPreviousMonth ? (
                <>
                  <ComparisonMetric
                    label={activeMonth === currentMonth ? '前月同日までとの差額' : '前月との差額'}
                    value={formatSignedCurrency(monthOverMonthDifference)}
                    warning={monthOverMonthDifference > 0}
                  />
                  <ComparisonMetric
                    label={activeMonth === currentMonth ? '前月同日までとの比率' : '前月比'}
                    value={formatMonthOverMonthRate(monthOverMonthRate)}
                    warning={monthOverMonthDifference > 0}
                  />
                </>
              ) : null}
              {recordedMonthAverage !== undefined ? (
                <ComparisonMetric
                  label="記録のある月平均"
                  value={`${Math.round(recordedMonthAverage).toLocaleString()}円`}
                />
              ) : null}
            </View>
          ) : null}
          {comparisonMessage ? (
            <Text style={styles.comparisonNote}>{comparisonMessage}</Text>
          ) : null}
          <MonthlyTrendChart activeMonth={activeMonth} rows={monthlyTrend} />
          <Text style={styles.note}>
            価格入力済みの履歴だけを集計しています。「未」は価格未入力の件数です。
          </Text>
        </AppCard>
      ) : null}

      {visibleHistory.length === 0 ? (
        <EmptyState
          title="購入履歴はまだありません"
          message="商品詳細から在庫を補充すると、月ごとの費用を振り返れるようになります。"
        />
      ) : filteredHistory.length === 0 ? (
        <EmptyState
          title={`${activeMonthLabel}の購入履歴はありません`}
          message="前後の月へ移動すると、過去の購入履歴を確認できます。"
        />
      ) : displayedHistory.length === 0 && showMissingPriceOnly ? (
        <EmptyState
          title="価格未入力の履歴はありません"
          message="この月の購入履歴には、すべて価格が入力されています。"
        />
      ) : (
        <View style={styles.list}>
          {displayedHistory.map((entry) => (
            <AppCard key={entry.id} style={styles.entry}>
              <View style={styles.entryHeader}>
                <Text style={styles.date}>{formatDisplayDate(entry.purchasedAt)}</Text>
                {editingHistoryId === entry.id ? null : (
                  <AppButton
                    title={entry.price === undefined ? '価格を入力' : '編集'}
                    variant="ghost"
                    onPress={() => startEditingPrice(entry)}
                    style={styles.editButton}
                  />
                )}
              </View>
              <Text style={styles.name}>
                {entry.itemName ?? itemNames.get(entry.inventoryItemId) ?? '削除済みの商品'}
              </Text>
              <Text style={styles.catName}>
                {getHistoryCatLabel(entry, itemCatNames, catNames)}
              </Text>
              {editingHistoryId === entry.id ? (
                <View style={styles.editArea}>
                  {entry.amount > 0 ? (
                    <Text style={styles.detail}>
                      {entry.amount}
                      {unitLabels[entry.unit]}
                    </Text>
                  ) : null}
                  <AppTextInput
                    label="価格"
                    value={editingPrice}
                    onChangeText={setEditingPrice}
                    keyboardType="numeric"
                    placeholder="例：1280"
                  />
                  <View style={styles.editActions}>
                    <AppButton
                      title="キャンセル"
                      variant="ghost"
                      disabled={savingHistoryPrice}
                      onPress={cancelEditingPrice}
                      style={styles.editAction}
                    />
                    <AppButton
                      title={savingHistoryPrice ? '保存中...' : '保存'}
                      loading={savingHistoryPrice}
                      onPress={() => void saveEditingPrice()}
                      style={styles.editAction}
                    />
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{
                      busy: deletingHistoryId === entry.id,
                      disabled: savingHistoryPrice || deletingHistoryId === entry.id,
                    }}
                    disabled={savingHistoryPrice || deletingHistoryId === entry.id}
                    onPress={() => confirmDeleteHistory(entry)}
                    style={({ pressed }) => [styles.deleteHistoryButton, pressed && styles.pressed]}
                  >
                    <Text style={styles.deleteHistoryText}>
                      {deletingHistoryId === entry.id ? '削除中...' : 'この履歴を削除'}
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <Text style={styles.detail}>{formatHistoryDetail(entry)}</Text>
              )}
              {entry.shopName ? <Text style={styles.detail}>購入先：{entry.shopName}</Text> : null}
              {entry.memo ? <Text style={styles.memo}>{entry.memo}</Text> : null}
            </AppCard>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

type MonthlyTrendRow = {
  key: string;
  label: string;
  total: number;
  pricedCount: number;
  missingPriceCount: number;
};

type ComparisonAvailability = {
  hasCurrentPrice: boolean;
  hasEarlierPricedHistory: boolean;
  hasPreviousPrice: boolean;
};

function getHistoryCatLabel(
  entry: PurchaseHistory,
  itemCatNames: Map<string, string>,
  catNames: Map<string, string>,
): string {
  const currentLabel = itemCatNames.get(entry.inventoryItemId);
  if (currentLabel) return currentLabel;

  const snapshotLabel = (entry.catIds ?? [])
    .map((catId) => catNames.get(catId))
    .filter((name): name is string => Boolean(name))
    .join('・');
  return snapshotLabel || 'ペットプロフィール未設定';
}

function ComparisonMetric({
  label,
  value,
  warning = false,
}: {
  label: string;
  value: string;
  warning?: boolean;
}) {
  return (
    <View style={styles.comparisonMetric}>
      <Text style={[styles.comparisonValue, warning && styles.warningValue]}>{value}</Text>
      <Text style={styles.comparisonLabel}>{label}</Text>
    </View>
  );
}

function MonthlyTrendChart({
  activeMonth,
  rows,
}: {
  activeMonth: string;
  rows: MonthlyTrendRow[];
}) {
  const maxTotal = Math.max(...rows.map((row) => row.total), 1);

  return (
    <View style={styles.trendChart}>
      {rows.map((row) => {
        const isActiveMonth = row.key === activeMonth;
        const barHeight = row.total > 0 ? Math.max((row.total / maxTotal) * 112, 4) : 0;
        return (
          <View key={row.key} style={styles.trendColumn}>
            <Text style={styles.trendValue} numberOfLines={1} adjustsFontSizeToFit>
              {row.pricedCount > 0 ? formatCompactCurrency(row.total) : '—'}
            </Text>
            <View style={styles.trendBarTrack}>
              <View
                style={[
                  styles.trendBar,
                  { height: barHeight },
                  isActiveMonth && styles.currentTrendBar,
                ]}
              />
            </View>
            <Text style={[styles.trendLabel, isActiveMonth && styles.currentTrendLabel]}>
              {row.label}
            </Text>
            {row.missingPriceCount > 0 ? (
              <Text style={styles.missingMark}>未{row.missingPriceCount}</Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function buildMonthlyTrend(history: PurchaseHistory[], activeMonth: string): MonthlyTrendRow[] {
  const activeMonthDate = parseISO(`${activeMonth}-01`);
  const currentMonth = format(new Date(), 'yyyy-MM');
  return Array.from({ length: 6 }, (_, index) => {
    const month = subMonths(activeMonthDate, 5 - index);
    const key = format(month, 'yyyy-MM');
    const entries = getHistoryForMonth(
      history,
      key,
      key === currentMonth ? getDate(new Date()) : undefined,
    );
    const pricedEntries = entries.filter((entry) => entry.price !== undefined);
    return {
      key,
      label: format(month, 'M月'),
      total: pricedEntries.reduce((sum, entry) => sum + (entry.price ?? 0), 0),
      pricedCount: pricedEntries.length,
      missingPriceCount: entries.filter((entry) => entry.price === undefined).length,
    };
  });
}

function formatSignedCurrency(value: number): string {
  if (value === 0) return '±0円';
  return `${value > 0 ? '+' : '-'}${Math.abs(value).toLocaleString()}円`;
}

function formatMonthOverMonthRate(rate: number | undefined): string {
  if (rate === undefined) return '比較なし';
  if (Math.abs(rate) < 0.05) return '±0%';
  return `${rate > 0 ? '+' : ''}${rate.toFixed(1)}%`;
}

function formatCompactCurrency(value: number): string {
  if (value >= 10000) return `${(value / 10000).toFixed(value >= 100000 ? 0 : 1)}万`;
  return value.toLocaleString();
}

function formatHistoryDetail(entry: PurchaseHistory): string {
  const parts = [
    entry.amount > 0 ? `${entry.amount}${unitLabels[entry.unit]}` : undefined,
    entry.price !== undefined ? `${entry.price.toLocaleString()}円` : '価格未入力',
  ];
  return parts.filter((part): part is string => Boolean(part)).join(' ・ ');
}

function getComparisonMessage({
  hasCurrentPrice,
  hasEarlierPricedHistory,
  hasPreviousPrice,
}: ComparisonAvailability): string | undefined {
  if (!hasCurrentPrice) return 'この月は価格入力済みの記録がないため比較できません。';
  if (!hasEarlierPricedHistory) {
    return '最初の記録月です。比較は次の月から表示します。';
  }
  if (!hasPreviousPrice) {
    return '前月に価格入力済みの購入記録がないため比較できません。';
  }
  return undefined;
}

function getHistoryForMonth(
  history: PurchaseHistory[],
  month: string,
  cutoffDay?: number,
): PurchaseHistory[] {
  const maxDay = cutoffDay
    ? Math.min(cutoffDay, getDaysInMonth(parseISO(`${month}-01`)))
    : undefined;
  return history.filter((entry) => {
    const purchasedAt = parseISO(entry.purchasedAt);
    if (!isValid(purchasedAt) || monthKeyOf(entry.purchasedAt) !== month) return false;
    return maxDay === undefined || getDate(purchasedAt) <= maxDay;
  });
}

function getOldestMonth(history: PurchaseHistory[], currentMonth: string): string | undefined {
  return history
    .map((entry) => monthKeyOf(entry.purchasedAt))
    .filter((month) => month && month <= currentMonth)
    .sort((a, b) => a.localeCompare(b))[0];
}

function normalizeMonthKey(value?: string): string | undefined {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return undefined;
  const parsed = parseISO(`${value}-01`);
  if (!isValid(parsed) || format(parsed, 'yyyy-MM') !== value) return undefined;
  return value <= format(new Date(), 'yyyy-MM') ? value : undefined;
}

function monthKeyOf(iso: string) {
  const parsed = parseISO(iso);
  return isValid(parsed) ? format(parsed, 'yyyy-MM') : '';
}

const styles = StyleSheet.create({
  container: {
    gap: 14,
    padding: 18,
    paddingBottom: 40,
  },
  summaryCard: {
    gap: 12,
  },
  monthNavigator: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  monthMoveButton: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  monthMoveText: {
    color: colors.primaryDark,
    fontSize: 28,
    lineHeight: 30,
  },
  monthLabel: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  summaryLabel: {
    color: colors.subText,
    fontSize: 13,
    fontWeight: '700',
  },
  totalValue: {
    color: colors.primaryDark,
    fontSize: 32,
    fontWeight: '900',
  },
  disabledButton: {
    opacity: 0.35,
  },
  pressed: {
    opacity: 0.72,
  },
  listFilterRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  missingPriceFilter: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  missingPriceFilterSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  missingPriceFilterText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  missingPriceFilterTextSelected: {
    color: colors.card,
  },
  showAllHistoryButton: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 9,
  },
  showAllHistoryText: {
    color: colors.primaryDark,
    fontSize: 13,
    fontWeight: '800',
  },
  trendCard: {
    gap: 12,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  comparisonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  comparisonMetric: {
    backgroundColor: colors.muted,
    borderRadius: 8,
    flexGrow: 1,
    minWidth: 96,
    padding: 12,
  },
  comparisonValue: {
    color: colors.text,
    fontSize: 21,
    fontWeight: '900',
  },
  warningValue: {
    color: colors.warning,
  },
  comparisonLabel: {
    color: colors.subText,
    fontSize: 12,
    marginTop: 4,
  },
  comparisonNote: {
    backgroundColor: colors.muted,
    borderRadius: 10,
    color: colors.subText,
    fontSize: 13,
    lineHeight: 19,
    padding: 12,
  },
  note: {
    color: colors.subText,
    fontSize: 12,
    marginTop: 6,
  },
  trendChart: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 6,
    height: 172,
    justifyContent: 'space-between',
    paddingTop: 8,
  },
  trendColumn: {
    alignItems: 'center',
    flex: 1,
  },
  trendValue: {
    color: colors.subText,
    fontSize: 10,
    marginBottom: 4,
    maxWidth: '100%',
  },
  trendBarTrack: {
    alignItems: 'stretch',
    backgroundColor: colors.muted,
    borderRadius: 6,
    height: 112,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    width: '72%',
  },
  trendBar: {
    backgroundColor: colors.primaryLight,
    borderRadius: 6,
    width: '100%',
  },
  currentTrendBar: {
    backgroundColor: colors.primary,
  },
  trendLabel: {
    color: colors.subText,
    fontSize: 11,
    marginTop: 5,
  },
  currentTrendLabel: {
    color: colors.primaryDark,
    fontWeight: '800',
  },
  missingMark: {
    color: colors.warning,
    fontSize: 9,
    marginTop: 1,
  },
  list: {
    gap: 12,
  },
  entry: {
    gap: 6,
  },
  entryHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  date: {
    color: colors.subText,
    fontSize: 13,
    flex: 1,
  },
  editButton: {
    minHeight: 36,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  name: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  catName: {
    color: colors.primaryDark,
    fontSize: 13,
    fontWeight: '700',
  },
  detail: {
    color: colors.text,
    fontSize: 14,
  },
  editArea: {
    gap: 10,
  },
  editActions: {
    flexDirection: 'row',
    gap: 8,
  },
  editAction: {
    flex: 1,
  },
  deleteHistoryButton: {
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  deleteHistoryText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '700',
  },
  memo: {
    color: colors.subText,
    fontSize: 14,
    lineHeight: 20,
  },
});
