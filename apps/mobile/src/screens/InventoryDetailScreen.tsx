import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
  getInventoryCatIds,
  calculateRemainingDays,
  calculateRemainingPercent,
  getInventoryStatus,
} from '@/features/inventory/inventoryLogic';
import {
  addPurchaseHistory,
  deleteInventoryItem,
  getInventoryItem,
  getInventoryItems,
  replenishInventoryItem,
  saveInventoryItem,
} from '@/features/inventory/inventoryStorage';
import { InventoryItem, LastingDaysReplenishMode, PurchaseHistory } from '@/features/inventory/inventoryTypes';
import { getPurchasePriceComparison, openPurchaseUrl, ShopType } from '@/features/inventory/purchaseLink';
import { clearIconReference, hasIconUploadStorage, pickAndUploadIcon, saveIconReference } from '@/features/media/iconUpload';
import { scheduleInventoryNotifications } from '@/features/notifications/notificationService';
import { getSettings } from '@/features/settings/settingsStorage';
import { useHouseholdSyncEvents } from '@/features/sync/useHouseholdSyncEvents';
import { formatDisplayDate, nowIso, todayIso } from '@/utils/date';
import { createId, isValidOptionalUrl, parseOptionalNumber } from '@/utils/validation';

export default function InventoryDetailScreen() {
  const router = useRouter();
  const { id, action } = useLocalSearchParams<{ id: string; action?: string }>();
  const scrollViewRef = useRef<ScrollView>(null);
  const replenishCardYRef = useRef(0);
  const purchaseCardYRef = useRef(0);
  const historyCardYRef = useRef(0);
  const [item, setItem] = useState<InventoryItem | undefined>();
  const [cats, setCats] = useState<Cat[]>([]);
  const [showReplenish, setShowReplenish] = useState(false);
  const [showHistoryAdd, setShowHistoryAdd] = useState(false);
  const [replenishDate, setReplenishDate] = useState(todayIso());
  const [price, setPrice] = useState('');
  const [memo, setMemo] = useState('');
  const [historyDate, setHistoryDate] = useState(todayIso());
  const [historyPrice, setHistoryPrice] = useState('');
  const [historyMemo, setHistoryMemo] = useState('');
  const [showStockEdit, setShowStockEdit] = useState(false);
  const [editPurchaseDate, setEditPurchaseDate] = useState(todayIso());
  const [editPrice, setEditPrice] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editDailyUsage, setEditDailyUsage] = useState('');
  const [editLastingDays, setEditLastingDays] = useState('');
  const [editMemo, setEditMemo] = useState('');
  const [imageUploading, setImageUploading] = useState(false);
  const [showPurchaseLinkEdit, setShowPurchaseLinkEdit] = useState(false);
  const [editAmazonUrl, setEditAmazonUrl] = useState('');
  const [editRakutenUrl, setEditRakutenUrl] = useState('');
  const [editYahooUrl, setEditYahooUrl] = useState('');
  const [editOtherUrl, setEditOtherUrl] = useState('');

  const resetStockEditFields = (nextItem: InventoryItem) => {
    setEditPurchaseDate(nextItem.purchaseDate);
    setEditPrice(nextItem.price?.toString() ?? '');
    setEditAmount(String(nextItem.amount));
    setEditDailyUsage(nextItem.dailyUsage?.toString() ?? '');
    setEditLastingDays(nextItem.lastingDays?.toString() ?? '');
    setEditMemo(nextItem.memo ?? '');
  };

  const resetPurchaseLinkFields = (nextItem: InventoryItem) => {
    setEditAmazonUrl(nextItem.purchaseLinks.amazon ?? '');
    setEditRakutenUrl(nextItem.purchaseLinks.rakuten ?? '');
    setEditYahooUrl(nextItem.purchaseLinks.yahoo ?? '');
    setEditOtherUrl(nextItem.purchaseLinks.other ?? '');
  };

  const load = useCallback(async () => {
    if (!id) return;
    const [next, nextCats] = await Promise.all([getInventoryItem(id), getCats()]);
    setItem(next);
    setCats(nextCats);
    if (next) {
      resetStockEditFields(next);
      resetPurchaseLinkFields(next);
      if (action === 'replenish') {
        setReplenishDate(todayIso());
        setPrice(next.price?.toString() ?? '');
        setMemo('');
        setShowReplenish(true);
      }
    }
  }, [action, id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  useHouseholdSyncEvents(() => {
    void load();
  });

  useEffect(() => {
    if (!showReplenish && action !== 'purchase') return;
    const timeout = setTimeout(() => {
      const targetY = action === 'purchase' ? purchaseCardYRef.current : replenishCardYRef.current;
      scrollViewRef.current?.scrollTo({ y: Math.max(0, targetY - 12), animated: true });
    }, 120);
    return () => clearTimeout(timeout);
  }, [action, showReplenish]);

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
  const contentAmountLabel = item.amount > 0 ? `${item.amount}${unitLabels[item.unit]}` : '未設定';
  const remainingStockLabel = formatRemainingStockValue(item, percent);
  const catNames = getInventoryCatIds(item)
    .map((catId) => cats.find((cat) => cat.id === catId)?.name)
    .filter(Boolean)
    .join('・');
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

  const selectProductIcon = async () => {
    if (!hasIconUploadStorage()) {
      Alert.alert('保存先が未設定です', 'SupabaseのURLとAnon Keyを設定すると、アイコンをサーバーに保存できます。');
      return;
    }

    try {
      setImageUploading(true);
      const result = await pickAndUploadIcon({ kind: 'products', ownerId: item.id });
      if (result.status !== 'uploaded') return;
      const nextItem: InventoryItem = {
        ...item,
        imageUrl: result.url,
        updatedAt: nowIso(),
      };
      await saveInventoryItem(nextItem);
      await saveIconReference('inventory_item', item.id, result.url);
      setItem(nextItem);
    } catch (error) {
      Alert.alert('アイコンを保存できませんでした', error instanceof Error ? error.message : '時間をおいてもう一度お試しください。');
    } finally {
      setImageUploading(false);
    }
  };

  const remove = () => {
    Alert.alert('削除しますか？', `${item.name}と関連する購入履歴を削除します。`, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除する',
        style: 'destructive',
        onPress: async () => {
          await deleteInventoryItem(item.id);
          await clearIconReference('inventory_item', item.id);
          const [items, settings] = await Promise.all([getInventoryItems(), getSettings()]);
          await scheduleInventoryNotifications(items, settings);
          router.back();
        },
      },
    ]);
  };

  const openReplenish = () => {
    setReplenishDate(todayIso());
    setPrice(item.price?.toString() ?? '');
    setMemo('');
    setShowReplenish(true);
  };

  const closeReplenish = () => {
    setShowReplenish(false);
    setPrice('');
    setMemo('');
  };

  const openHistoryAdd = () => {
    setHistoryDate(todayIso());
    setHistoryPrice(item.price?.toString() ?? '');
    setHistoryMemo('');
    setShowHistoryAdd(true);
    setTimeout(() => {
      scrollViewRef.current?.scrollTo({ y: Math.max(0, historyCardYRef.current - 12), animated: true });
    }, 120);
  };

  const closeHistoryAdd = () => {
    setShowHistoryAdd(false);
    setHistoryPrice('');
    setHistoryMemo('');
  };

  const submitReplenish = () => {
    const replenishAmount = getReplenishAmount(item);
    const priceNumber = parseOptionalNumber(price);
    if ((!item.estimationMode || item.estimationMode === 'usage') && replenishAmount <= 0) {
      Alert.alert('入力を確認してください', '設定済みの内容量が0以下です。残量・計算設定から内容量を確認してください。');
      return;
    }
    if (price.trim() && (priceNumber === undefined || priceNumber < 0)) {
      Alert.alert('入力を確認してください', '価格は0以上の数字で入力してください。');
      return;
    }
    if (item.estimationMode === 'lasting_days') {
      Alert.alert(
        '補充後の残り日数',
        `${formatDisplayDate(replenishDate)}の補充として記録します。残っている日数をどう扱いますか？`,
        [
          { text: 'キャンセル', style: 'cancel' },
          { text: '残りに足す', onPress: () => confirmPriceAndSaveReplenish(replenishAmount, priceNumber, 'add_remaining') },
          { text: '周期に戻す', onPress: () => confirmPriceAndSaveReplenish(replenishAmount, priceNumber, 'reset_cycle') },
        ],
      );
      return;
    }

    Alert.alert('補充を保存しますか？', `${formatDisplayDate(replenishDate)}の補充として記録します。`, [
      { text: 'キャンセル', style: 'cancel' },
      { text: '保存する', onPress: () => confirmPriceAndSaveReplenish(replenishAmount, priceNumber) },
    ]);
  };

  const confirmPriceAndSaveReplenish = (
    amountNumber: number,
    priceNumber: number | undefined,
    lastingDaysReplenishMode: LastingDaysReplenishMode = 'add_remaining',
  ) => {
    if (priceNumber !== item.price) {
      Alert.alert(
        '商品価格を更新しますか？',
        `補充価格を${priceNumber === undefined ? '未入力' : `${priceNumber.toLocaleString()}円`}で記録します。商品に設定済みの価格も更新しますか？`,
        [
          { text: '更新しない', onPress: () => void saveReplenish(true, amountNumber, priceNumber, false, lastingDaysReplenishMode) },
          { text: '更新する', onPress: () => void saveReplenish(true, amountNumber, priceNumber, true, lastingDaysReplenishMode) },
        ],
      );
      return;
    }
    void saveReplenish(true, amountNumber, priceNumber, false, lastingDaysReplenishMode);
  };

  const saveReplenish = async (
    resetOpenedDate: boolean,
    amountNumber: number,
    priceNumber: number | undefined,
    shouldUpdateItemPrice: boolean,
    lastingDaysReplenishMode: LastingDaysReplenishMode = 'add_remaining',
  ) => {
    const history: PurchaseHistory = {
      id: createId('history'),
      inventoryItemId: item.id,
      purchasedAt: replenishDate,
      amount: amountNumber,
      unit: item.unit,
      price: priceNumber,
      memo: memo.trim() || undefined,
      createdAt: nowIso(),
    };
    const settings = await getSettings();
    const itemForReplenish: InventoryItem = shouldUpdateItemPrice
      ? {
          ...item,
          price: priceNumber,
        }
      : item;
    const nextItem = await replenishInventoryItem(itemForReplenish, history, resetOpenedDate, lastingDaysReplenishMode);
    const items = await getInventoryItems();
    await scheduleInventoryNotifications(items, settings);
    setItem(nextItem);
    closeReplenish();
    resetStockEditFields(nextItem);
  };

  const submitPastPurchaseHistory = () => {
    const priceNumber = parseOptionalNumber(historyPrice);
    if (historyPrice.trim() && (priceNumber === undefined || priceNumber < 0)) {
      Alert.alert('入力を確認してください', '価格は0以上の数字で入力してください。');
      return;
    }
    Alert.alert('購入履歴を追加しますか？', `${formatDisplayDate(historyDate)}の購入として記録します。`, [
      { text: 'キャンセル', style: 'cancel' },
      { text: '追加する', onPress: () => void savePastPurchaseHistory(priceNumber) },
    ]);
  };

  const savePastPurchaseHistory = async (priceNumber: number | undefined) => {
    const history: PurchaseHistory = {
      id: createId('history'),
      inventoryItemId: item.id,
      purchasedAt: historyDate,
      amount: item.amount,
      unit: item.unit,
      price: priceNumber,
      memo: historyMemo.trim() || undefined,
      createdAt: nowIso(),
    };
    await addPurchaseHistory(history);
    closeHistoryAdd();
    Alert.alert('追加しました', '購入履歴に追加しました。');
  };

  const saveStockEdit = async () => {
    const priceNumber = parseOptionalNumber(editPrice);
    const amountNumber = parseOptionalNumber(editAmount);
    const dailyUsageNumber = parseOptionalNumber(editDailyUsage);
    const lastingDaysNumber = parseOptionalNumber(editLastingDays);

    if (editPrice.trim() && (priceNumber === undefined || priceNumber < 0)) {
      Alert.alert('入力を確認してください', '価格は0以上の数字で入力してください。');
      return;
    }
    if (editAmount.trim() && (amountNumber === undefined || amountNumber < 0)) {
      Alert.alert('入力を確認してください', '内容量・残量は0以上の数字で入力してください。');
      return;
    }
    if ((!item.estimationMode || item.estimationMode === 'usage') && (!amountNumber || amountNumber <= 0)) {
      Alert.alert('入力を確認してください', '内容量・残量は0より大きくしてください。');
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
      price: priceNumber,
      amount: item.estimationMode === 'purchase_frequency' ? item.amount : amountNumber ?? 0,
      dailyUsage: !item.estimationMode || item.estimationMode === 'usage' ? dailyUsageNumber : item.dailyUsage,
      lastingDays: item.estimationMode === 'lasting_days' ? lastingDaysNumber : item.lastingDays,
      purchaseDate: editPurchaseDate,
      estimatedEndDate: item.estimationMode === 'purchase_frequency' ? item.estimatedEndDate : undefined,
      memo: editMemo.trim() || undefined,
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

  const openPurchaseLinkEdit = () => {
    resetPurchaseLinkFields(item);
    setShowPurchaseLinkEdit(true);
  };

  const savePurchaseLinks = async () => {
    const urls = [editAmazonUrl, editRakutenUrl, editYahooUrl, editOtherUrl];
    if (urls.some((url) => !isValidOptionalUrl(url.trim() || undefined))) {
      Alert.alert('入力を確認してください', 'URLは http:// または https:// で始めてください。');
      return;
    }
    const nextItem: InventoryItem = {
      ...item,
      purchaseLinks: {
        amazon: editAmazonUrl.trim() || undefined,
        rakuten: editRakutenUrl.trim() || undefined,
        yahoo: editYahooUrl.trim() || undefined,
        other: editOtherUrl.trim() || undefined,
      },
      updatedAt: nowIso(),
    };
    await saveInventoryItem(nextItem);
    setItem(nextItem);
    resetPurchaseLinkFields(nextItem);
    setShowPurchaseLinkEdit(false);
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
    <ScrollView ref={scrollViewRef} contentContainerStyle={styles.container}>
      <AppCard style={styles.card}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            disabled={imageUploading}
            onPress={() => void selectProductIcon()}
            style={({ pressed }) => [styles.productImageButton, pressed && styles.productImagePressed]}
          >
            {item.imageUrl ? (
              <Image source={{ uri: item.imageUrl }} style={styles.productImage} resizeMode="cover" />
            ) : (
              <View style={styles.productImagePlaceholder}>
                <Text style={styles.productImagePlaceholderText}>画像</Text>
              </View>
            )}
            <Text style={styles.productImageEditText}>{imageUploading ? '保存中' : '変更'}</Text>
          </Pressable>
          <View style={styles.titleWrap}>
            <Text style={styles.title}>{item.name}</Text>
            <Text style={styles.sub}>{catNames ? `${catNames} ・ ${categoryLabels[item.category]}` : categoryLabels[item.category]}</Text>
          </View>
          <StatusBadge status={status} />
        </View>
        <View style={styles.metrics}>
          <Metric label="残り日数" value={remainingDays === undefined ? '未計算' : `${Math.max(0, remainingDays)}日`} />
          <Metric label="残量" value={remainingStockLabel} />
        </View>
      </AppCard>

      <AppCard style={styles.card}>
        <View style={styles.infoHeader}>
          <Text style={styles.sectionTitle}>商品情報</Text>
          <AppButton
            title={showStockEdit ? 'キャンセル' : '編集'}
            variant="secondary"
            onPress={
              showStockEdit
                ? () => {
                    resetStockEditFields(item);
                    setShowStockEdit(false);
                  }
                : openStockEdit
            }
            style={styles.editButton}
          />
        </View>
        {showStockEdit ? (
          <>
            <AppTextInput label="価格" value={editPrice} onChangeText={setEditPrice} keyboardType="numeric" />
            <DatePickerField
              label="購入日"
              value={editPurchaseDate}
              onChange={setEditPurchaseDate}
              requirement="required"
            />
            {item.estimationMode !== 'purchase_frequency' ? (
              <>
                <AppTextInput
                  label={`内容量・残量（${unitLabels[item.unit]}）`}
                  value={editAmount}
                  onChangeText={setEditAmount}
                  keyboardType="decimal-pad"
                />
                <AppTextInput
                  label={`消費ペース（${unitLabels[item.unit]}/日）`}
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
              <Text style={styles.affiliate}>購入頻度は補充履歴から自動計算するため、ここでは価格・購入日・メモを変更できます。</Text>
            ) : null}
            <AppTextInput
              label="メモ"
              value={editMemo}
              onChangeText={setEditMemo}
              multiline
              placeholder="メモ"
              style={styles.memo}
            />
            <AppButton title="保存" onPress={() => void saveStockEdit()} />
          </>
        ) : (
          <>
            <Info label="価格" value={item.price === undefined ? '未入力' : `${item.price.toLocaleString()}円`} />
            <Info label="購入日" value={formatDisplayDate(item.purchaseDate)} />
            <Info label="推定終了日" value={formatDisplayDate(item.estimatedEndDate)} />
            <Info label="残り日数の計算方法" value={estimationLabel} />
            <Info label="内容量" value={contentAmountLabel} />
            <Info label="残量" value={remainingStockLabel} />
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
          </>
        )}
      </AppCard>

      <View
        onLayout={(event) => {
          purchaseCardYRef.current = event.nativeEvent.layout.y;
        }}
      >
        <AppCard style={styles.card}>
          <View style={styles.infoHeader}>
            <Text style={styles.sectionTitle}>購入する</Text>
            <AppButton
              title={showPurchaseLinkEdit ? 'キャンセル' : 'URL設定'}
              variant="secondary"
              onPress={
                showPurchaseLinkEdit
                  ? () => {
                      resetPurchaseLinkFields(item);
                      setShowPurchaseLinkEdit(false);
                    }
                  : openPurchaseLinkEdit
              }
              style={styles.editButton}
            />
          </View>
          <Text style={styles.affiliate}>リンクにはアフィリエイトが含まれる場合があります</Text>
          {showPurchaseLinkEdit ? (
            <>
              <AppTextInput
                label="Amazon URL"
                value={editAmazonUrl}
                onChangeText={setEditAmazonUrl}
                keyboardType="url"
                autoCapitalize="none"
              />
              <AppTextInput
                label="楽天 URL"
                value={editRakutenUrl}
                onChangeText={setEditRakutenUrl}
                keyboardType="url"
                autoCapitalize="none"
              />
              <AppTextInput
                label="Yahoo URL"
                value={editYahooUrl}
                onChangeText={setEditYahooUrl}
                keyboardType="url"
                autoCapitalize="none"
              />
              <AppTextInput
                label="その他URL"
                value={editOtherUrl}
                onChangeText={setEditOtherUrl}
                keyboardType="url"
                autoCapitalize="none"
              />
              <AppButton title="URLを保存" onPress={() => void savePurchaseLinks()} />
            </>
          ) : (
            <View style={styles.actionGrid}>
              <PurchaseButton
                label="Amazon"
                configured={Boolean(item.purchaseLinks.amazon)}
                primary
                onPress={() => void buy('amazon')}
              />
              <PurchaseButton
                label="楽天"
                configured={Boolean(item.purchaseLinks.rakuten)}
                onPress={() => void buy('rakuten')}
              />
              <PurchaseButton
                label="Yahoo"
                configured={Boolean(item.purchaseLinks.yahoo)}
                onPress={() => void buy('yahoo')}
              />
              <PurchaseButton
                label="その他"
                configured={Boolean(item.purchaseLinks.other)}
                onPress={() => void buy('other')}
              />
            </View>
          )}
        </AppCard>
      </View>

      {showReplenish ? (
        <View
          onLayout={(event) => {
            replenishCardYRef.current = event.nativeEvent.layout.y;
          }}
        >
          <AppCard style={styles.card}>
            <Text style={styles.sectionTitle}>補充内容</Text>
            <DatePickerField
              label="補充日"
              value={replenishDate}
              onChange={setReplenishDate}
              requirement="required"
            />
            <AppTextInput label="価格" value={price} onChangeText={setPrice} keyboardType="numeric" />
            <AppTextInput label="メモ" value={memo} onChangeText={setMemo} multiline style={styles.memo} />
            <AppButton title="補充を保存" onPress={submitReplenish} />
            <AppButton title="閉じる" variant="secondary" onPress={closeReplenish} />
          </AppCard>
        </View>
      ) : null}

      {showHistoryAdd ? (
        <View
          onLayout={(event) => {
            historyCardYRef.current = event.nativeEvent.layout.y;
          }}
        >
          <AppCard style={styles.card}>
            <Text style={styles.sectionTitle}>過去の購入履歴</Text>
            <DatePickerField
              label="購入日"
              value={historyDate}
              onChange={setHistoryDate}
              requirement="required"
            />
            <AppTextInput label="価格" value={historyPrice} onChangeText={setHistoryPrice} keyboardType="numeric" />
            <AppTextInput label="メモ" value={historyMemo} onChangeText={setHistoryMemo} multiline style={styles.memo} />
            <AppButton title="購入履歴を追加" onPress={submitPastPurchaseHistory} />
            <AppButton title="閉じる" variant="secondary" onPress={closeHistoryAdd} />
          </AppCard>
        </View>
      ) : null}

      <View style={styles.bottomActions}>
        <AppButton title="在庫を補充した" onPress={openReplenish} />
        <AppButton title="過去の購入履歴を追加" variant="secondary" onPress={openHistoryAdd} />
      </View>

      <AppCard style={styles.dangerZone}>
        <Text style={styles.dangerZoneTitle}>削除</Text>
        <Text style={styles.dangerZoneText}>商品と関連する購入履歴を削除します。</Text>
        <AppButton title="この商品を削除" variant="danger" onPress={remove} />
      </AppCard>
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

function PurchaseButton({
  label,
  configured,
  primary,
  onPress,
}: {
  label: string;
  configured: boolean;
  primary?: boolean;
  onPress: () => void;
}) {
  return (
    <AppButton
      title={configured ? `${label}で買う` : `${label} URL未設定`}
      variant={configured && primary ? 'primary' : 'secondary'}
      onPress={onPress}
    />
  );
}

function formatRemainingStockValue(item: InventoryItem, percent: number | undefined): string {
  if (percent === undefined) return '未設定';
  if (item.estimationMode === 'lasting_days') {
    if (item.amount > 0) {
      return `${formatQuantity((item.amount * Math.max(0, percent)) / 100)}${unitLabels[item.unit]}`;
    }
    return `${percent}%`;
  }
  if (item.amount <= 0) return '未設定';
  return `${percent}%`;
}

function formatQuantity(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(Math.round(value * 10) / 10);
}

function getReplenishAmount(item: InventoryItem): number {
  return item.amount;
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
  bottomActions: {
    gap: 10,
  },
  dangerZone: {
    borderColor: colors.danger,
    gap: 10,
    marginTop: 12,
  },
  dangerZoneTitle: {
    color: colors.danger,
    fontSize: 15,
    fontWeight: '900',
  },
  dangerZoneText: {
    color: colors.subText,
    fontSize: 13,
    lineHeight: 19,
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  productImageButton: {
    alignItems: 'center',
    backgroundColor: colors.muted,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    height: 76,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 76,
  },
  productImagePressed: {
    opacity: 0.75,
  },
  productImage: {
    height: '100%',
    width: '100%',
  },
  productImagePlaceholder: {
    alignItems: 'center',
    height: '100%',
    justifyContent: 'center',
    width: '100%',
  },
  productImagePlaceholderText: {
    color: colors.primaryDark,
    fontSize: 14,
    fontWeight: '900',
  },
  productImageEditText: {
    backgroundColor: 'rgba(0, 0, 0, 0.48)',
    bottom: 0,
    color: colors.card,
    fontSize: 11,
    fontWeight: '800',
    left: 0,
    paddingVertical: 3,
    position: 'absolute',
    right: 0,
    textAlign: 'center',
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
  infoHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  editButton: {
    minHeight: 40,
    paddingHorizontal: 14,
    paddingVertical: 8,
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
