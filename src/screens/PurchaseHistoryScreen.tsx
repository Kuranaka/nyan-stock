import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { isSameMonth, parseISO } from 'date-fns';
import { useFocusEffect } from 'expo-router';

import { AppCard } from '@/components/AppCard';
import { EmptyState } from '@/components/EmptyState';
import { colors } from '@/constants/colors';
import { getInventoryItems, getPurchaseHistory } from '@/features/inventory/inventoryStorage';
import { InventoryItem, PurchaseHistory } from '@/features/inventory/inventoryTypes';
import { formatDisplayDate } from '@/utils/date';

export default function PurchaseHistoryScreen() {
  const [history, setHistory] = useState<PurchaseHistory[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);

  useFocusEffect(
    useCallback(() => {
      async function load() {
        const [nextHistory, nextItems] = await Promise.all([getPurchaseHistory(), getInventoryItems()]);
        setHistory(nextHistory);
        setItems(nextItems);
      }
      void load();
    }, []),
  );

  const itemNames = useMemo(
    () => new Map(items.map((item) => [item.id, item.name])),
    [items],
  );
  const monthlyTotal = history
    .filter((entry) => entry.price && isSameMonth(parseISO(entry.purchasedAt), new Date()))
    .reduce((sum, entry) => sum + (entry.price ?? 0), 0);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <AppCard>
        <Text style={styles.total}>今月の猫用品：{monthlyTotal.toLocaleString()}円</Text>
        <Text style={styles.note}>価格未入力の履歴は合計から除外しています。</Text>
      </AppCard>

      {history.length === 0 ? (
        <EmptyState
          title="購入履歴はまだありません"
          message="商品詳細から在庫を補充すると、月ごとの費用を振り返れるようになります。"
        />
      ) : (
        <View style={styles.list}>
          {history.map((entry) => (
            <AppCard key={entry.id} style={styles.entry}>
              <Text style={styles.date}>{formatDisplayDate(entry.purchasedAt)}</Text>
              <Text style={styles.name}>{itemNames.get(entry.inventoryItemId) ?? '削除済みの商品'}</Text>
              <Text style={styles.detail}>
                {entry.amount}
                {entry.unit}
                {entry.price ? ` ・ ${entry.price.toLocaleString()}円` : ''}
              </Text>
              {entry.shopName ? <Text style={styles.detail}>購入先：{entry.shopName}</Text> : null}
              {entry.memo ? <Text style={styles.memo}>{entry.memo}</Text> : null}
            </AppCard>
          ))}
        </View>
      )}
    </ScrollView>
  );
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
  date: {
    color: colors.subText,
    fontSize: 13,
  },
  name: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  detail: {
    color: colors.text,
    fontSize: 14,
  },
  memo: {
    color: colors.subText,
    fontSize: 14,
    lineHeight: 20,
  },
});
