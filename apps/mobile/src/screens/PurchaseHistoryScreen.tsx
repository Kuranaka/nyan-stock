import { useCallback, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { format, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';
import { useFocusEffect } from 'expo-router';

import { AppButton } from '@/components/AppButton';
import { AppCard } from '@/components/AppCard';
import { AppTextInput } from '@/components/AppTextInput';
import { EmptyState } from '@/components/EmptyState';
import { unitLabels } from '@/constants/categories';
import { colors } from '@/constants/colors';
import { getCats } from '@/features/cats/catStorage';
import { Cat } from '@/features/cats/catTypes';
import { getInventoryCatIds } from '@/features/inventory/inventoryLogic';
import { deletePurchaseHistory, getInventoryItems, getPurchaseHistory, updatePurchaseHistoryPrice } from '@/features/inventory/inventoryStorage';
import { InventoryItem, PurchaseHistory } from '@/features/inventory/inventoryTypes';
import { useHouseholdSyncEvents } from '@/features/sync/useHouseholdSyncEvents';
import { formatDisplayDate } from '@/utils/date';

export default function PurchaseHistoryScreen() {
  const [history, setHistory] = useState<PurchaseHistory[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [cats, setCats] = useState<Cat[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string | undefined>();
  const [editingHistoryId, setEditingHistoryId] = useState<string | undefined>();
  const [editingPrice, setEditingPrice] = useState('');
  const [savingHistoryPrice, setSavingHistoryPrice] = useState(false);
  const [deletingHistoryId, setDeletingHistoryId] = useState<string | undefined>();

  const load = useCallback(async () => {
    const [nextHistory, nextItems, nextCats] = await Promise.all([
      getPurchaseHistory(),
      getInventoryItems(),
      getCats(),
    ]);
    setHistory(nextHistory);
    setItems(nextItems);
    setCats(nextCats);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  useHouseholdSyncEvents(() => {
    void load();
  });

  const itemNames = useMemo(
    () => new Map(items.map((item) => [item.id, item.name])),
    [items],
  );
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
  const monthOptions = useMemo(() => buildMonthOptions(history), [history]);
  const currentMonth = format(new Date(), 'yyyy-MM');
  const activeMonth = selectedMonth ?? (monthOptions.some((month) => month.value === currentMonth) ? currentMonth : monthOptions[0]?.value);
  const filteredHistory = activeMonth
    ? history.filter((entry) => monthKeyOf(entry.purchasedAt) === activeMonth)
    : history;
  const monthlyTotal = filteredHistory
    .filter((entry) => entry.price)
    .reduce((sum, entry) => sum + (entry.price ?? 0), 0);
  const activeMonthLabel = monthOptions.find((month) => month.value === activeMonth)?.label ?? '購入履歴';

  function startEditingPrice(entry: PurchaseHistory) {
    setEditingHistoryId(entry.id);
    setEditingPrice(entry.price ? String(entry.price) : '');
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
      Alert.alert('保存できませんでした', error instanceof Error ? error.message : '時間をおいてもう一度お試しください。');
    } finally {
      setSavingHistoryPrice(false);
    }
  }

  function confirmDeleteHistory(entry: PurchaseHistory) {
    if (deletingHistoryId) return;
    Alert.alert('購入履歴を削除しますか？', `${formatDisplayDate(entry.purchasedAt)}の購入履歴を削除します。`, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除する',
        style: 'destructive',
        onPress: async () => {
          setDeletingHistoryId(entry.id);
          try {
            const nextHistory = await deletePurchaseHistory(entry.id);
            setHistory(nextHistory);
            if (editingHistoryId === entry.id) {
              setEditingHistoryId(undefined);
              setEditingPrice('');
            }
          } catch (error) {
            Alert.alert('削除できませんでした', error instanceof Error ? error.message : '時間をおいてもう一度お試しください。');
          } finally {
            setDeletingHistoryId(undefined);
          }
        },
      },
    ]);
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <AppCard style={styles.summaryCard}>
        <Text style={styles.total}>{activeMonthLabel}の猫用品：{monthlyTotal.toLocaleString()}円</Text>
        {monthOptions.length > 0 ? (
          <View style={styles.monthTabs}>
            {monthOptions.map((month) => (
              <AppButton
                key={month.value}
                title={month.label}
                variant={month.value === activeMonth ? 'primary' : 'secondary'}
                onPress={() => setSelectedMonth(month.value)}
                style={styles.monthTab}
              />
            ))}
          </View>
        ) : null}
        <Text style={styles.note}>価格未入力の履歴は合計から除外しています。</Text>
      </AppCard>

      {history.length === 0 ? (
        <EmptyState
          title="購入履歴はまだありません"
          message="商品詳細から在庫を補充すると、月ごとの費用を振り返れるようになります。"
        />
      ) : (
        <View style={styles.list}>
          {filteredHistory.map((entry) => (
            <AppCard key={entry.id} style={styles.entry}>
              <View style={styles.entryHeader}>
                <Text style={styles.date}>{formatDisplayDate(entry.purchasedAt)}</Text>
                {editingHistoryId === entry.id ? null : (
                  <View style={styles.entryActions}>
                    <AppButton
                      title="編集"
                      variant="secondary"
                      onPress={() => startEditingPrice(entry)}
                      style={styles.editButton}
                    />
                    <AppButton
                      title={deletingHistoryId === entry.id ? '削除中...' : '削除'}
                      variant="danger"
                      loading={deletingHistoryId === entry.id}
                      onPress={() => confirmDeleteHistory(entry)}
                      style={styles.editButton}
                    />
                  </View>
                )}
              </View>
              <Text style={styles.name}>{itemNames.get(entry.inventoryItemId) ?? '削除済みの商品'}</Text>
              <Text style={styles.catName}>
                {itemCatNames.get(entry.inventoryItemId) || '猫プロフィール未設定'}
              </Text>
              {editingHistoryId === entry.id ? (
                <View style={styles.editArea}>
                  <Text style={styles.detail}>
                    {entry.amount}
                    {unitLabels[entry.unit]}
                  </Text>
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
                </View>
              ) : (
                <Text style={styles.detail}>
                  {entry.amount}
                  {unitLabels[entry.unit]}
                  {entry.price ? ` ・ ${entry.price.toLocaleString()}円` : ' ・ 価格未入力'}
                </Text>
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

function buildMonthOptions(history: PurchaseHistory[]) {
  const monthKeys = Array.from(new Set(history.map((entry) => monthKeyOf(entry.purchasedAt))));
  return monthKeys
    .sort((a, b) => b.localeCompare(a))
    .map((value) => ({
      value,
      label: format(parseISO(`${value}-01`), 'yyyy年M月', { locale: ja }),
    }));
}

function monthKeyOf(iso: string) {
  return format(parseISO(iso), 'yyyy-MM');
}

const styles = StyleSheet.create({
  container: {
    gap: 14,
    padding: 18,
    paddingBottom: 40,
  },
  total: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '900',
  },
  summaryCard: {
    gap: 12,
  },
  monthTabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  monthTab: {
    minWidth: 110,
  },
  note: {
    color: colors.subText,
    fontSize: 12,
    marginTop: 6,
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
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  entryActions: {
    flexDirection: 'row',
    gap: 8,
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
  memo: {
    color: colors.subText,
    fontSize: 14,
    lineHeight: 20,
  },
});
