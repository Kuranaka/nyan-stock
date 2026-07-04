import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { AppButton } from '@/components/AppButton';
import { AppCard } from '@/components/AppCard';
import { AppTextInput } from '@/components/AppTextInput';
import { StatusBadge } from '@/components/StatusBadge';
import { categoryLabels } from '@/constants/categories';
import { colors } from '@/constants/colors';
import { getCats } from '@/features/cats/catStorage';
import { Cat } from '@/features/cats/catTypes';
import {
  calculateRemainingDays,
  calculateRemainingPercent,
  getInventoryStatus,
} from '@/features/inventory/inventoryLogic';
import {
  deleteInventoryItem,
  getInventoryItem,
  getInventoryItems,
  replenishInventoryItem,
} from '@/features/inventory/inventoryStorage';
import { InventoryItem, PurchaseHistory } from '@/features/inventory/inventoryTypes';
import { openPurchaseUrl, ShopType } from '@/features/inventory/purchaseLink';
import { scheduleInventoryNotifications } from '@/features/notifications/notificationService';
import { getSettings } from '@/features/settings/settingsStorage';
import { formatDisplayDate, nowIso, todayIso } from '@/utils/date';
import { createId, parseOptionalNumber } from '@/utils/validation';

export default function InventoryDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [item, setItem] = useState<InventoryItem | undefined>();
  const [cats, setCats] = useState<Cat[]>([]);
  const [showReplenish, setShowReplenish] = useState(false);
  const [replenishDate, setReplenishDate] = useState(todayIso());
  const [amount, setAmount] = useState('');
  const [price, setPrice] = useState('');
  const [shopName, setShopName] = useState('');
  const [memo, setMemo] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    const [next, nextCats] = await Promise.all([getInventoryItem(id), getCats()]);
    setItem(next);
    setCats(nextCats);
    if (next) setAmount(String(next.amount));
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!item) {
    return (
      <View style={styles.center}>
        <Text style={styles.missing}>商品が見つかりません。</Text>
        <AppButton title="戻る" onPress={() => router.back()} />
      </View>
    );
  }

  const remainingDays = calculateRemainingDays(item);
  const percent = calculateRemainingPercent(item);
  const status = getInventoryStatus(item);
  const catName = cats.find((cat) => cat.id === item.catId)?.name;
  const estimationLabel =
    item.estimationMode === 'purchase_frequency'
      ? '購入頻度から自動計算待ち'
      : item.estimationMode === 'lasting_days'
        ? '買い替えまでの日数'
        : '内容量と消費量';

  const remove = () => {
    Alert.alert('削除しますか？', `${item.name}と関連する購入履歴を削除します。`, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除する',
        style: 'destructive',
        onPress: async () => {
          await deleteInventoryItem(item.id);
          const [items, settings] = await Promise.all([getInventoryItems(), getSettings()]);
          await scheduleInventoryNotifications(items, settings);
          router.back();
        },
      },
    ]);
  };

  const submitReplenish = () => {
    const amountNumber = parseOptionalNumber(amount);
    if (!amountNumber || amountNumber <= 0) {
      Alert.alert('入力を確認してください', '内容量は0より大きくしてください。');
      return;
    }
    Alert.alert('開封日も更新しますか？', '補充日を開封日として保存できます。', [
      { text: '更新しない', onPress: () => void saveReplenish(false, amountNumber) },
      { text: '更新する', onPress: () => void saveReplenish(true, amountNumber) },
    ]);
  };

  const saveReplenish = async (resetOpenedDate: boolean, amountNumber: number) => {
    const history: PurchaseHistory = {
      id: createId('history'),
      inventoryItemId: item.id,
      purchasedAt: replenishDate,
      amount: amountNumber,
      unit: item.unit,
      price: parseOptionalNumber(price),
      shopName: shopName.trim() || undefined,
      memo: memo.trim() || undefined,
      createdAt: nowIso(),
    };
    const nextItem = await replenishInventoryItem(item, history, resetOpenedDate);
    const [items, settings] = await Promise.all([getInventoryItems(), getSettings()]);
    await scheduleInventoryNotifications(items, settings);
    setItem(nextItem);
    setShowReplenish(false);
    setPrice('');
    setShopName('');
    setMemo('');
  };

  const buy = async (shop: ShopType) => {
    const opened = await openPurchaseUrl(item, shop);
    if (!opened) Alert.alert('URLが未登録です', '編集画面から購入URLを登録できます。');
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <AppCard style={styles.card}>
        <View style={styles.header}>
          <View style={styles.titleWrap}>
            <Text style={styles.title}>{item.name}</Text>
            <Text style={styles.sub}>{catName ? `${catName} ・ ${categoryLabels[item.category]}` : categoryLabels[item.category]}</Text>
          </View>
          <StatusBadge status={status} />
        </View>
        <View style={styles.metrics}>
          <Metric label="残り日数" value={remainingDays === undefined ? '未計算' : `${Math.max(0, remainingDays)}日`} />
          <Metric label="残量" value={percent === undefined ? '--%' : `${percent}%`} />
        </View>
      </AppCard>

      <AppCard style={styles.card}>
        <Info label="購入日" value={formatDisplayDate(item.purchaseDate)} />
        <Info label="開封日" value={formatDisplayDate(item.openedDate)} />
        <Info label="推定終了日" value={formatDisplayDate(item.estimatedEndDate)} />
        <Info label="推定方法" value={estimationLabel} />
        <Info
          label="消費ペース"
          value={item.dailyUsage ? `${item.dailyUsage}${item.unit}/日` : '未設定'}
        />
        <Info label="メモ" value={item.memo || '未入力'} />
      </AppCard>

      <AppCard style={styles.card}>
        <Text style={styles.sectionTitle}>購入する</Text>
        <Text style={styles.affiliate}>リンクにはアフィリエイトが含まれる場合があります</Text>
        <View style={styles.actionGrid}>
          <AppButton title="Amazonで買う" onPress={() => void buy('amazon')} />
          <AppButton title="楽天で買う" variant="secondary" onPress={() => void buy('rakuten')} />
          <AppButton title="Yahooで買う" variant="secondary" onPress={() => void buy('yahoo')} />
          <AppButton title="その他で買う" variant="secondary" onPress={() => void buy('other')} />
        </View>
      </AppCard>

      {showReplenish ? (
        <AppCard style={styles.card}>
          <Text style={styles.sectionTitle}>補充内容</Text>
          <AppTextInput label="補充日" value={replenishDate} onChangeText={setReplenishDate} />
          <AppTextInput label="内容量" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
          <AppTextInput label="価格" value={price} onChangeText={setPrice} keyboardType="numeric" />
          <AppTextInput label="購入先" value={shopName} onChangeText={setShopName} />
          <AppTextInput label="メモ" value={memo} onChangeText={setMemo} multiline style={styles.memo} />
          <AppButton title="補充を保存" onPress={submitReplenish} />
          <AppButton title="閉じる" variant="secondary" onPress={() => setShowReplenish(false)} />
        </AppCard>
      ) : null}

      <AppButton title="在庫を補充した" onPress={() => setShowReplenish(true)} />
      <AppButton
        title="編集"
        variant="secondary"
        onPress={() => router.push({ pathname: '/inventory-form', params: { id: item.id } })}
      />
      <AppButton title="削除" variant="danger" onPress={remove} />
    </ScrollView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 14,
    padding: 18,
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    padding: 24,
  },
  missing: {
    color: colors.subText,
    fontSize: 16,
  },
  card: {
    gap: 14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  titleWrap: {
    flex: 1,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '900',
  },
  sub: {
    color: colors.subText,
    fontSize: 14,
    marginTop: 4,
  },
  metrics: {
    flexDirection: 'row',
    gap: 12,
  },
  metric: {
    flex: 1,
    backgroundColor: colors.muted,
    borderRadius: 14,
    padding: 14,
  },
  metricLabel: {
    color: colors.subText,
    fontSize: 13,
  },
  metricValue: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '900',
    marginTop: 4,
  },
  infoRow: {
    gap: 3,
  },
  infoLabel: {
    color: colors.subText,
    fontSize: 12,
  },
  infoValue: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 23,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  affiliate: {
    color: colors.subText,
    fontSize: 12,
  },
  actionGrid: {
    gap: 10,
  },
  memo: {
    minHeight: 80,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
});
