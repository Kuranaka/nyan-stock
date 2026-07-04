import { useCallback, useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { AppButton } from '@/components/AppButton';
import { AppCard } from '@/components/AppCard';
import { AppTextInput } from '@/components/AppTextInput';
import { DatePickerField } from '@/components/DatePickerField';
import { StatusBadge } from '@/components/StatusBadge';
import { categoryLabels, unitLabels } from '@/constants/categories';
import { colors } from '@/constants/colors';
import { getCats } from '@/features/cats/catStorage';
import { Cat } from '@/features/cats/catTypes';
import {
  calculatePurchaseFrequencyDays,
  calculateRemainingDays,
  calculateRemainingPercent,
  getInventoryStatus,
} from '@/features/inventory/inventoryLogic';
import {
  deleteInventoryItem,
  getInventoryItem,
  getInventoryItems,
  replenishInventoryItem,
  saveInventoryItem,
} from '@/features/inventory/inventoryStorage';
import { InventoryItem, LastingDaysReplenishMode, PurchaseHistory } from '@/features/inventory/inventoryTypes';
import { getPurchasePriceComparison, openPurchaseUrl, ShopType } from '@/features/inventory/purchaseLink';
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
  const [showStockEdit, setShowStockEdit] = useState(false);
  const [editPurchaseDate, setEditPurchaseDate] = useState(todayIso());
  const [editAmount, setEditAmount] = useState('');
  const [editDailyUsage, setEditDailyUsage] = useState('');
  const [editLastingDays, setEditLastingDays] = useState('');

  const resetStockEditFields = (nextItem: InventoryItem) => {
    setEditPurchaseDate(nextItem.purchaseDate);
    setEditAmount(String(nextItem.amount));
    setEditDailyUsage(nextItem.dailyUsage?.toString() ?? '');
    setEditLastingDays(nextItem.lastingDays?.toString() ?? '');
  };

  const load = useCallback(async () => {
    if (!id) return;
    const [next, nextCats] = await Promise.all([getInventoryItem(id), getCats()]);
    setItem(next);
    setCats(nextCats);
    if (next) {
      setAmount(String(next.amount));
      resetStockEditFields(next);
    }
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
  const purchaseFrequencyDays = calculatePurchaseFrequencyDays(item);
  const status = getInventoryStatus(item);
  const catName = cats.find((cat) => cat.id === item.catId)?.name;
  const estimationLabel =
    item.estimationMode === 'purchase_frequency'
      ? '購入頻度から自動計算'
      : item.estimationMode === 'lasting_days'
        ? '使い切る日数'
        : '内容量と1日の使用量';
  const shouldShowDailyUsage = !item.estimationMode || item.estimationMode === 'usage';

  const openStockEdit = () => {
    resetStockEditFields(item);
    setShowStockEdit(true);
  };

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
    if (item.estimationMode === 'lasting_days') {
      Alert.alert(
        '補充後の残り日数',
        `${formatDisplayDate(replenishDate)}の補充として記録します。残っている日数をどう扱いますか？`,
        [
          { text: 'キャンセル', style: 'cancel' },
          { text: '残りに足す', onPress: () => void saveReplenish(true, amountNumber, 'add_remaining') },
          { text: '周期に戻す', onPress: () => void saveReplenish(true, amountNumber, 'reset_cycle') },
        ],
      );
      return;
    }

    Alert.alert('補充を保存しますか？', `${formatDisplayDate(replenishDate)}の補充として記録します。`, [
      { text: 'キャンセル', style: 'cancel' },
      { text: '保存する', onPress: () => void saveReplenish(true, amountNumber) },
    ]);
  };

  const saveReplenish = async (
    resetOpenedDate: boolean,
    amountNumber: number,
    lastingDaysReplenishMode: LastingDaysReplenishMode = 'add_remaining',
  ) => {
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
    const settings = await getSettings();
    const nextItem = await replenishInventoryItem(item, history, resetOpenedDate, lastingDaysReplenishMode);
    const items = await getInventoryItems();
    await scheduleInventoryNotifications(items, settings);
    setItem(nextItem);
    setShowReplenish(false);
    setPrice('');
    setShopName('');
    setMemo('');
    resetStockEditFields(nextItem);
  };

  const saveStockEdit = async () => {
    const amountNumber = parseOptionalNumber(editAmount);
    const dailyUsageNumber = parseOptionalNumber(editDailyUsage);
    const lastingDaysNumber = parseOptionalNumber(editLastingDays);

    if ((!item.estimationMode || item.estimationMode === 'usage') && (!amountNumber || amountNumber <= 0)) {
      Alert.alert('入力を確認してください', '残量は0より大きくしてください。');
      return;
    }
    if ((!item.estimationMode || item.estimationMode === 'usage') && (!dailyUsageNumber || dailyUsageNumber <= 0)) {
      Alert.alert('入力を確認してください', '1日あたりの消費量は0より大きくしてください。');
      return;
    }
    if (item.estimationMode === 'lasting_days' && (!lastingDaysNumber || lastingDaysNumber <= 0)) {
      Alert.alert('入力を確認してください', '使い切る日数は0より大きくしてください。');
      return;
    }

    const nextItem: InventoryItem = {
      ...item,
      amount: !item.estimationMode || item.estimationMode === 'usage' ? amountNumber ?? item.amount : item.amount,
      dailyUsage: !item.estimationMode || item.estimationMode === 'usage' ? dailyUsageNumber : item.dailyUsage,
      lastingDays: item.estimationMode === 'lasting_days' ? lastingDaysNumber : item.lastingDays,
      purchaseDate: editPurchaseDate,
      estimatedEndDate: undefined,
      updatedAt: nowIso(),
    };
    await saveInventoryItem(nextItem);
    const [items, settings] = await Promise.all([getInventoryItems(), getSettings()]);
    await scheduleInventoryNotifications(items, settings);
    const savedItem = await getInventoryItem(item.id);
    if (savedItem) {
      setItem(savedItem);
      resetStockEditFields(savedItem);
    }
    setShowStockEdit(false);
  };

  const switchToLastingDays = () => {
    if (!purchaseFrequencyDays) {
      Alert.alert('まだ切り替えできません', '購入頻度が計算されてから切り替えできます。先に補充を記録してください。');
      return;
    }
    Alert.alert(
      '残り日数の計算方法を切り替えますか？',
      `現在の購入頻度 ${purchaseFrequencyDays}日ごと を、固定の使い切る日数として使います。`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '切り替える',
          onPress: async () => {
            const nextItem: InventoryItem = {
              ...item,
              estimationMode: 'lasting_days',
              lastingDays: purchaseFrequencyDays,
              dailyUsage: undefined,
              estimatedEndDate: undefined,
              updatedAt: nowIso(),
            };
            await saveInventoryItem(nextItem);
            const [items, settings] = await Promise.all([getInventoryItems(), getSettings()]);
            await scheduleInventoryNotifications(items, settings);
            const savedItem = await getInventoryItem(item.id);
            if (savedItem) {
              setItem(savedItem);
              resetStockEditFields(savedItem);
            }
          },
        },
      ],
    );
  };

  const buy = async (shop: ShopType) => {
    if (shop === 'rakuten' || shop === 'yahoo') {
      const prices = await getPurchasePriceComparison(item);
      const message = buildPurchasePriceMessage(prices);
      const buttons = buildPurchasePageButtons(item);
      if (buttons.length === 1) {
        Alert.alert('URLが未登録です', '編集画面から楽天またはYahooのURLを登録できます。');
        return;
      }
      Alert.alert(
        hasAnyPrice(prices) ? '現在価格を確認しました' : '価格を確認できませんでした',
        `${message}\nどの購入ページを開きますか？`,
        buttons,
      );
      return;
    }
    const opened = await openPurchaseUrl(item, shop);
    if (!opened) Alert.alert('URLが未登録です', '編集画面から購入URLを登録できます。');
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <AppCard style={styles.card}>
        <View style={styles.header}>
          {item.imageUrl ? (
            <Image source={{ uri: item.imageUrl }} style={styles.productImage} resizeMode="contain" />
          ) : null}
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
        <Info label="推定終了日" value={formatDisplayDate(item.estimatedEndDate)} />
        <Info label="残り日数の計算方法" value={estimationLabel} />
        {item.estimationMode === 'lasting_days' ? (
          <Info label="使い切る日数" value={item.lastingDays === undefined ? '未設定' : `${item.lastingDays}日`} />
        ) : null}
        {item.estimationMode === 'purchase_frequency' ? (
          <>
            <Info label="現在の購入頻度" value={purchaseFrequencyDays === undefined ? '未計算' : `${purchaseFrequencyDays}日ごと`} />
            <AppButton
              title="使い切る日数方式に切り替える"
              variant="secondary"
              disabled={purchaseFrequencyDays === undefined}
              onPress={switchToLastingDays}
            />
          </>
        ) : null}
        {shouldShowDailyUsage ? (
          <Info
            label="消費ペース"
            value={item.dailyUsage ? `${item.dailyUsage}${unitLabels[item.unit]}/日` : '未設定'}
          />
        ) : null}
        <Info label="メモ" value={item.memo || '未入力'} />
      </AppCard>

      {showStockEdit ? (
        <AppCard style={styles.card}>
          <Text style={styles.sectionTitle}>残量・計算設定</Text>
          <DatePickerField
            label="購入日"
            value={editPurchaseDate}
            onChange={setEditPurchaseDate}
            requirement="required"
          />
          {!item.estimationMode || item.estimationMode === 'usage' ? (
            <>
              <AppTextInput
                label={`残量（${unitLabels[item.unit]}）`}
                value={editAmount}
                onChangeText={setEditAmount}
                keyboardType="decimal-pad"
              />
              <AppTextInput
                label={`1日あたりの消費量（${unitLabels[item.unit]}/日）`}
                value={editDailyUsage}
                onChangeText={setEditDailyUsage}
                keyboardType="decimal-pad"
              />
            </>
          ) : null}
          {item.estimationMode === 'lasting_days' ? (
            <AppTextInput
              label="使い切る日数"
              value={editLastingDays}
              onChangeText={setEditLastingDays}
              keyboardType="numeric"
            />
          ) : null}
          {item.estimationMode === 'purchase_frequency' ? (
            <Text style={styles.affiliate}>補充履歴から自動計算するため、ここでは購入日のみ変更できます。</Text>
          ) : null}
          <View style={styles.inlineActions}>
            <AppButton title="保存" onPress={() => void saveStockEdit()} style={styles.inlineAction} />
            <AppButton
              title="閉じる"
              variant="secondary"
              onPress={() => {
                resetStockEditFields(item);
                setShowStockEdit(false);
              }}
              style={styles.inlineAction}
            />
          </View>
        </AppCard>
      ) : null}

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
          <DatePickerField
            label="補充日"
            value={replenishDate}
            onChange={setReplenishDate}
            requirement="required"
          />
          <AppTextInput label="内容量" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
          <AppTextInput label="価格" value={price} onChangeText={setPrice} keyboardType="numeric" />
          <AppTextInput label="購入先" value={shopName} onChangeText={setShopName} />
          <AppTextInput label="メモ" value={memo} onChangeText={setMemo} multiline style={styles.memo} />
          <AppButton title="補充を保存" onPress={submitReplenish} />
          <AppButton title="閉じる" variant="secondary" onPress={() => setShowReplenish(false)} />
        </AppCard>
      ) : null}

      <AppButton title="在庫を補充した" onPress={() => setShowReplenish(true)} />
      <AppButton title="残量・計算設定を編集" variant="secondary" onPress={openStockEdit} />
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

function buildPurchasePriceMessage(prices: Awaited<ReturnType<typeof getPurchasePriceComparison>>): string {
  const rakuten = prices.rakuten?.price !== undefined ? `${prices.rakuten.price.toLocaleString()}円` : '取得できませんでした';
  const yahoo = prices.yahoo?.price !== undefined ? `${prices.yahoo.price.toLocaleString()}円` : '取得できませんでした';
  return `楽天: ${rakuten}\nYahoo: ${yahoo}`;
}

function hasAnyPrice(prices: Awaited<ReturnType<typeof getPurchasePriceComparison>>): boolean {
  return prices.rakuten?.price !== undefined || prices.yahoo?.price !== undefined;
}

function buildPurchasePageButtons(item: InventoryItem) {
  const buttons: { text: string; style?: 'cancel'; onPress?: () => void }[] = [
    { text: 'キャンセル', style: 'cancel' },
  ];
  const shops: { shop: ShopType; label: string }[] = [
    { shop: 'rakuten', label: '楽天を開く' },
    { shop: 'yahoo', label: 'Yahooを開く' },
  ];
  shops.forEach(({ shop, label }) => {
    if (item.purchaseLinks[shop]) {
      buttons.push({ text: label, onPress: () => void openPurchaseUrl(item, shop) });
    }
  });
  return buttons;
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
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  productImage: {
    backgroundColor: colors.muted,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    height: 76,
    width: 76,
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
  inlineActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  inlineAction: {
    flexGrow: 1,
    minWidth: 120,
  },
  memo: {
    minHeight: 80,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
});
