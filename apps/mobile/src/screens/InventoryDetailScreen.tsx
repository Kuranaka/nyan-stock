import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { addDays, format, parseISO } from 'date-fns';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { AppButton } from '@/components/AppButton';
import { AppCard } from '@/components/AppCard';
import { AppTextInput } from '@/components/AppTextInput';
import { DatePickerField } from '@/components/DatePickerField';
import { StatusBadge } from '@/components/StatusBadge';
import { categories, categoryLabels, unitLabels, units } from '@/constants/categories';
import { colors } from '@/constants/colors';
import { getCachedCats, getCats } from '@/features/cats/catStorage';
import { Cat } from '@/features/cats/catTypes';
import {
  calculatePurchaseFrequencyDays,
  calculateEstimatedEndDate,
  getInventoryCatIds,
  calculateRemainingDays,
  calculateRemainingPercent,
  getInventoryPredictionState,
  getInventoryStatus,
} from '@/features/inventory/inventoryLogic';
import {
  addPurchaseHistory,
  getCachedInventoryItem,
  deleteInventoryItem,
  getInventoryItem,
  getInventoryItems,
  getPurchaseHistory,
  replenishInventoryItem,
  saveInventoryItem,
} from '@/features/inventory/inventoryStorage';
import { calculatePurchaseFrequencyPrediction } from '@/features/inventory/purchaseFrequency';
import {
  InventoryEstimationMode,
  InventoryCategory,
  InventoryItem,
  InventoryUnit,
  LastingDaysReplenishMode,
  PurchaseHistory,
} from '@/features/inventory/inventoryTypes';
import {
  getPurchaseUrl,
  hasSavedPurchaseUrl,
  openPurchaseUrl,
  ShopType,
} from '@/features/inventory/purchaseLink';
import {
  clearIconReference,
  hasIconUploadStorage,
  pickAndUploadIcon,
  saveIconReference,
} from '@/features/media/iconUpload';
import { scheduleInventoryNotifications } from '@/features/notifications/notificationService';
import { usePreventUnsavedChanges } from '@/hooks/usePreventUnsavedChanges';
import { recordReviewEligibleAction } from '@/features/review/reviewPrompt';
import { getSettings } from '@/features/settings/settingsStorage';
import { useHouseholdSyncEvents } from '@/features/sync/useHouseholdSyncEvents';
import { formatDisplayDate, nowIso, todayIso } from '@/utils/date';
import {
  createId,
  isValidOptionalAmazonUrl,
  isValidOptionalRakutenUrl,
  isValidOptionalUrl,
  isValidOptionalYahooShoppingUrl,
  parseOptionalNumber,
} from '@/utils/validation';

type PurchaseLinkErrors = Partial<Record<ShopType, string>>;
type QuickAdjustMode = 'days' | 'amount';
const editableNotifyDays = [7, 3, 1];
const estimationModeOptions: { value: InventoryEstimationMode; label: string }[] = [
  { value: 'lasting_days', label: '使い切る日数' },
  { value: 'usage', label: '内容量と1日の使用量' },
  { value: 'purchase_frequency', label: '購入頻度から自動計算' },
  { value: 'no_estimate', label: '計算しない（不定期購入）' },
];

function areNumberArraysEqual(first: number[], second: number[]): boolean {
  if (first.length !== second.length) return false;
  return first.every((value, index) => value === second[index]);
}

export default function InventoryDetailScreen() {
  const router = useRouter();
  const { id, action } = useLocalSearchParams<{ id: string; action?: string }>();
  const initialItem = id ? getCachedInventoryItem(id) : undefined;
  const scrollViewRef = useRef<ScrollView>(null);
  const replenishCardYRef = useRef(0);
  const purchaseCardYRef = useRef(0);
  const historyCardYRef = useRef(0);
  const bottomActionsYRef = useRef(0);
  const hasScrolledToActionRef = useRef(false);
  const shouldScrollToReplenishRef = useRef(false);
  const shouldScrollToHistoryRef = useRef(false);
  const [item, setItem] = useState<InventoryItem | undefined>(() => initialItem);
  const [loading, setLoading] = useState(true);
  const [showMissingMessage, setShowMissingMessage] = useState(false);
  const [cats, setCats] = useState<Cat[]>(() => getCachedCats());
  const [showReplenish, setShowReplenish] = useState(action === 'replenish');
  const [savingReplenish, setSavingReplenish] = useState(false);
  const [savingQuickAdjust, setSavingQuickAdjust] = useState(false);
  const [savingStockEdit, setSavingStockEdit] = useState(false);
  const [savingHistoryAdd, setSavingHistoryAdd] = useState(false);
  const [savingPurchaseLinks, setSavingPurchaseLinks] = useState(false);
  const [switchingEstimationMode, setSwitchingEstimationMode] = useState(false);
  const [deletingItem, setDeletingItem] = useState(false);
  const [showHistoryAdd, setShowHistoryAdd] = useState(false);
  const [replenishDate, setReplenishDate] = useState(todayIso());
  const [price, setPrice] = useState(
    action === 'replenish' ? (initialItem?.price?.toString() ?? '') : '',
  );
  const [memo, setMemo] = useState('');
  const [historyDate, setHistoryDate] = useState(todayIso());
  const [historyPrice, setHistoryPrice] = useState('');
  const [historyMemo, setHistoryMemo] = useState('');
  const [showStockEdit, setShowStockEdit] = useState(false);
  const [showQuickAdjust, setShowQuickAdjust] = useState(false);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState<InventoryCategory>('other');
  const [editEstimationMode, setEditEstimationMode] = useState<InventoryEstimationMode>('usage');
  const [editPurchaseDate, setEditPurchaseDate] = useState(todayIso());
  const [editPrice, setEditPrice] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editUnit, setEditUnit] = useState<InventoryUnit>('g');
  const [editDailyUsage, setEditDailyUsage] = useState('');
  const [editLastingDays, setEditLastingDays] = useState('');
  const [editNotifyBeforeDays, setEditNotifyBeforeDays] = useState<number[]>([]);
  const [editMemo, setEditMemo] = useState('');
  const [quickAdjustMode, setQuickAdjustMode] = useState<QuickAdjustMode>('days');
  const [quickRemainingDays, setQuickRemainingDays] = useState('');
  const [quickRemainingAmount, setQuickRemainingAmount] = useState('');
  const [imageUploading, setImageUploading] = useState(false);
  const [showPurchaseLinkEdit, setShowPurchaseLinkEdit] = useState(false);
  const [editAmazonUrl, setEditAmazonUrl] = useState('');
  const [editRakutenUrl, setEditRakutenUrl] = useState('');
  const [editYahooUrl, setEditYahooUrl] = useState('');
  const [editOtherUrl, setEditOtherUrl] = useState('');
  const [purchaseLinkErrors, setPurchaseLinkErrors] = useState<PurchaseLinkErrors>({});

  const resetStockEditFields = (nextItem: InventoryItem) => {
    setEditName(nextItem.name);
    setEditCategory(nextItem.category);
    setEditEstimationMode(nextItem.estimationMode ?? 'usage');
    setEditPurchaseDate(nextItem.purchaseDate);
    setEditPrice(nextItem.price?.toString() ?? '');
    setEditAmount(String(nextItem.amount));
    setEditUnit(nextItem.unit);
    setEditDailyUsage(nextItem.dailyUsage?.toString() ?? '');
    setEditLastingDays(nextItem.lastingDays?.toString() ?? '');
    setEditNotifyBeforeDays(nextItem.notifyBeforeDays);
    setEditMemo(nextItem.memo ?? '');
  };

  const resetPurchaseLinkFields = (nextItem: InventoryItem) => {
    setEditAmazonUrl(nextItem.purchaseLinks.amazon ?? '');
    setEditRakutenUrl(nextItem.purchaseLinks.rakuten ?? '');
    setEditYahooUrl(nextItem.purchaseLinks.yahoo ?? '');
    setEditOtherUrl(nextItem.purchaseLinks.other ?? '');
  };

  const resetQuickAdjustFields = (nextItem: InventoryItem) => {
    const nextRemainingDays = calculateRemainingDays(nextItem);
    const nextRemainingAmount = calculateRemainingAmount(nextItem);
    setQuickRemainingDays(
      nextRemainingDays === undefined ? '' : String(Math.max(0, nextRemainingDays)),
    );
    setQuickRemainingAmount(
      nextRemainingAmount === undefined ? '' : formatQuantity(nextRemainingAmount),
    );
  };

  const hasUnsavedChanges = item
    ? (showStockEdit &&
        (editName !== item.name ||
          editCategory !== item.category ||
          editEstimationMode !== (item.estimationMode ?? 'usage') ||
          editPurchaseDate !== item.purchaseDate ||
          editPrice !== (item.price?.toString() ?? '') ||
          editAmount !== String(item.amount) ||
          editUnit !== item.unit ||
          editDailyUsage !== (item.dailyUsage?.toString() ?? '') ||
          editLastingDays !== (item.lastingDays?.toString() ?? '') ||
          !areNumberArraysEqual(editNotifyBeforeDays, item.notifyBeforeDays) ||
          editMemo !== (item.memo ?? ''))) ||
      (showQuickAdjust &&
        (quickAdjustMode !== 'days' ||
          quickRemainingDays !==
            String(Math.max(0, calculateRemainingDays(item) ?? Number.NaN)).replace('NaN', '') ||
          quickRemainingAmount !==
            (calculateRemainingAmount(item) === undefined
              ? ''
              : formatQuantity(calculateRemainingAmount(item) ?? 0)))) ||
      (showPurchaseLinkEdit &&
        (editAmazonUrl !== (item.purchaseLinks.amazon ?? '') ||
          editRakutenUrl !== (item.purchaseLinks.rakuten ?? '') ||
          editYahooUrl !== (item.purchaseLinks.yahoo ?? '') ||
          editOtherUrl !== (item.purchaseLinks.other ?? ''))) ||
      (showReplenish &&
        (replenishDate !== todayIso() ||
          price !== (item.price?.toString() ?? '') ||
          memo.trim().length > 0)) ||
      (showHistoryAdd &&
        (historyDate !== todayIso() ||
          historyPrice !== (item.price?.toString() ?? '') ||
          historyMemo.trim().length > 0))
    : false;

  const confirmDiscardChanges = useCallback(
    (onDiscard: () => void) => {
      if (!hasUnsavedChanges) {
        onDiscard();
        return;
      }
      Alert.alert('編集内容を破棄しますか？', '保存していない編集内容は消えます。', [
        { text: '戻る', style: 'cancel' },
        {
          text: '破棄する',
          style: 'destructive',
          onPress: onDiscard,
        },
      ]);
    },
    [hasUnsavedChanges],
  );

  const allowRemoval = usePreventUnsavedChanges(hasUnsavedChanges, confirmDiscardChanges);

  const load = useCallback(async () => {
    setLoading(true);
    setShowMissingMessage(false);
    try {
      if (!id) {
        setItem(undefined);
        return;
      }
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
    } finally {
      setLoading(false);
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
    hasScrolledToActionRef.current = false;
  }, [action, id]);

  const scrollToActionTarget = useCallback(() => {
    if (hasScrolledToActionRef.current) return;
    if (action !== 'purchase' && action !== 'replenish') return;
    if (action === 'replenish' && !showReplenish) return;
    const targetY =
      action === 'purchase'
        ? purchaseCardYRef.current
        : bottomActionsYRef.current + replenishCardYRef.current;
    if (targetY <= 0) return;
    hasScrolledToActionRef.current = true;
    requestAnimationFrame(() => {
      scrollViewRef.current?.scrollTo({ y: Math.max(0, targetY - 12), animated: true });
    });
  }, [action, showReplenish]);

  useEffect(() => {
    scrollToActionTarget();
  }, [scrollToActionTarget]);

  useEffect(() => {
    if (loading || item) {
      setShowMissingMessage(false);
      return;
    }
    const timeout = setTimeout(() => {
      setShowMissingMessage(true);
    }, 700);
    return () => clearTimeout(timeout);
  }, [item, loading]);

  if (!item) {
    return (
      <View style={styles.center}>
        {showMissingMessage ? (
          <>
            <Text style={styles.missing}>商品が見つかりません。</Text>
            <AppButton title="戻る" onPress={() => router.back()} />
          </>
        ) : (
          <Text style={styles.missing}>読み込んでいます...</Text>
        )}
      </View>
    );
  }

  const remainingDays = calculateRemainingDays(item);
  const percent = calculateRemainingPercent(item);
  const purchaseFrequencyDays = calculatePurchaseFrequencyDays(item);
  const status = getInventoryStatus(item);
  const predictionState = getInventoryPredictionState(item);
  const statusLabel =
    status !== 'unknown'
      ? undefined
      : predictionState === 'learning'
        ? '自動予測中'
        : predictionState === 'disabled'
          ? '日数表示なし'
          : '予測なし';
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
        : item.estimationMode === 'no_estimate'
          ? '計算しない（不定期購入）'
          : '内容量と1日の使用量';
  const shouldShowDailyUsage = !item.estimationMode || item.estimationMode === 'usage';

  const openStockEdit = () => {
    resetStockEditFields(item);
    setShowStockEdit(true);
  };

  const toggleEditNotifyBeforeDay = (day: number) => {
    setEditNotifyBeforeDays((currentDays) =>
      currentDays.includes(day)
        ? currentDays.filter((currentDay) => currentDay !== day)
        : [...currentDays, day].sort((a, b) => b - a),
    );
  };

  const openQuickAdjust = () => {
    resetQuickAdjustFields(item);
    setQuickAdjustMode('days');
    setShowQuickAdjust(true);
  };

  const closeQuickAdjust = () => {
    if (savingQuickAdjust) return;
    resetQuickAdjustFields(item);
    setShowQuickAdjust(false);
  };

  const saveQuickAdjust = async () => {
    if (savingQuickAdjust) return;
    const remainingDaysNumber = parseOptionalNumber(quickRemainingDays);
    const remainingAmountNumber = parseOptionalNumber(quickRemainingAmount);
    const canAdjustAmount = item.estimationMode !== 'purchase_frequency';

    if (
      quickAdjustMode === 'days' &&
      (!quickRemainingDays.trim() || remainingDaysNumber === undefined || remainingDaysNumber < 0)
    ) {
      Alert.alert('入力を確認してください', '残り日数は0以上の数字で入力してください。');
      return;
    }
    if (
      quickAdjustMode === 'amount' &&
      (!canAdjustAmount ||
        !quickRemainingAmount.trim() ||
        remainingAmountNumber === undefined ||
        remainingAmountNumber < 0)
    ) {
      Alert.alert('入力を確認してください', '残量は0以上の数字で入力してください。');
      return;
    }
    if (
      quickAdjustMode === 'amount' &&
      item.estimationMode === 'lasting_days' &&
      (!item.amount || item.amount <= 0 || !item.lastingDays || item.lastingDays <= 0)
    ) {
      Alert.alert(
        '入力を確認してください',
        '残量から残り日数を計算するには、商品情報の内容量と使い切る日数を設定してください。',
      );
      return;
    }
    if (
      quickAdjustMode === 'amount' &&
      remainingAmountNumber !== undefined &&
      item.amount > 0 &&
      remainingAmountNumber > item.amount
    ) {
      Alert.alert('入力を確認してください', '残量は内容量以下で入力してください。');
      return;
    }
    if (
      quickAdjustMode === 'days' &&
      (!item.estimationMode || item.estimationMode === 'usage') &&
      (!item.dailyUsage || item.dailyUsage <= 0)
    ) {
      Alert.alert(
        '入力を確認してください',
        '残り日数から残量を計算するには、商品情報の消費ペースを設定してください。',
      );
      return;
    }

    const today = parseISO(todayIso());
    const lastingDaysForAdjustment =
      item.estimationMode === 'lasting_days' ? item.lastingDays : undefined;
    const amountBasedRemainingDays =
      quickAdjustMode === 'amount' &&
      item.estimationMode === 'lasting_days' &&
      remainingAmountNumber !== undefined &&
      lastingDaysForAdjustment
        ? Math.ceil((remainingAmountNumber / item.amount) * lastingDaysForAdjustment)
        : undefined;
    const usageAmountBasedRemainingDays =
      quickAdjustMode === 'amount' &&
      (!item.estimationMode || item.estimationMode === 'usage') &&
      remainingAmountNumber !== undefined &&
      item.dailyUsage
        ? Math.ceil(remainingAmountNumber / item.dailyUsage)
        : undefined;
    const nextRemainingDays =
      quickAdjustMode === 'days'
        ? remainingDaysNumber
        : (amountBasedRemainingDays ?? usageAmountBasedRemainingDays);
    const daysBasedRemainingAmount =
      quickAdjustMode === 'days' &&
      (!item.estimationMode || item.estimationMode === 'usage') &&
      remainingDaysNumber !== undefined &&
      item.dailyUsage
        ? remainingDaysNumber * item.dailyUsage
        : undefined;
    const adjustedRemainingAmount = daysBasedRemainingAmount ?? remainingAmountNumber;
    const shouldAdjustUsageRemaining = Boolean(
      (!item.estimationMode || item.estimationMode === 'usage') &&
      adjustedRemainingAmount !== undefined &&
      item.dailyUsage,
    );
    const adjustedOpenedDate =
      shouldAdjustUsageRemaining && item.dailyUsage && adjustedRemainingAmount !== undefined
        ? addDays(
            today,
            -Math.max(
              0,
              (item.amount - Math.min(adjustedRemainingAmount, item.amount)) / item.dailyUsage,
            ),
          )
        : item.openedDate;
    const formattedAdjustedOpenedDate =
      adjustedOpenedDate instanceof Date
        ? format(adjustedOpenedDate, 'yyyy-MM-dd')
        : adjustedOpenedDate;
    const adjustedEstimatedEndDate =
      nextRemainingDays === undefined
        ? undefined
        : format(addDays(today, nextRemainingDays), 'yyyy-MM-dd');
    const nextItem: InventoryItem = {
      ...item,
      amount: item.amount,
      openedDate: formattedAdjustedOpenedDate,
      estimatedEndDate:
        adjustedEstimatedEndDate === undefined
          ? shouldAdjustUsageRemaining
            ? undefined
            : item.estimatedEndDate
          : adjustedEstimatedEndDate,
      updatedAt: nowIso(),
    };

    setSavingQuickAdjust(true);
    try {
      await saveInventoryItem(nextItem);
      const [items, settings] = await Promise.all([getInventoryItems(), getSettings()]);
      await scheduleInventoryNotifications(items, settings);
      const savedItem = await getInventoryItem(item.id);
      if (savedItem) {
        setItem(savedItem);
        resetStockEditFields(savedItem);
        resetQuickAdjustFields(savedItem);
      }
      setShowQuickAdjust(false);
    } catch (error) {
      Alert.alert(
        '保存できませんでした',
        error instanceof Error ? error.message : '時間をおいてもう一度お試しください。',
      );
    } finally {
      setSavingQuickAdjust(false);
    }
  };

  const selectProductIcon = async () => {
    if (!hasIconUploadStorage()) {
      Alert.alert(
        '保存先が未設定です',
        'SupabaseのURLとAnon Keyを設定すると、アイコンをサーバーに保存できます。',
      );
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
      Alert.alert(
        'アイコンを保存できませんでした',
        error instanceof Error ? error.message : '時間をおいてもう一度お試しください。',
      );
    } finally {
      setImageUploading(false);
    }
  };

  const remove = () => {
    if (deletingItem) return;
    Alert.alert('削除しますか？', `${item.name}を削除します。購入履歴は残ります。`, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除する',
        style: 'destructive',
        onPress: async () => {
          setDeletingItem(true);
          try {
            await deleteInventoryItem(item.id);
            await clearIconReference('inventory_item', item.id);
            const [items, settings] = await Promise.all([getInventoryItems(), getSettings()]);
            await scheduleInventoryNotifications(items, settings);
            allowRemoval(() => router.back());
          } catch (error) {
            Alert.alert(
              '削除できませんでした',
              error instanceof Error ? error.message : '時間をおいてもう一度お試しください。',
            );
            setDeletingItem(false);
          }
        },
      },
    ]);
  };

  const openReplenish = () => {
    setReplenishDate(todayIso());
    setPrice(item.price?.toString() ?? '');
    setMemo('');
    shouldScrollToReplenishRef.current = true;
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
    shouldScrollToHistoryRef.current = true;
    setShowHistoryAdd(true);
  };

  const closeHistoryAdd = () => {
    if (savingHistoryAdd) return;
    setShowHistoryAdd(false);
    setHistoryPrice('');
    setHistoryMemo('');
  };

  const submitReplenish = () => {
    if (savingReplenish) return;
    const replenishAmount = getReplenishAmount(item);
    const priceNumber = parseOptionalNumber(price);
    if ((!item.estimationMode || item.estimationMode === 'usage') && replenishAmount <= 0) {
      Alert.alert(
        '入力を確認してください',
        '設定済みの内容量が0以下です。残量・計算設定から内容量を確認してください。',
      );
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
          {
            text: '残りに足す',
            onPress: () =>
              confirmPriceAndSaveReplenish(replenishAmount, priceNumber, 'add_remaining'),
          },
          {
            text: '周期に戻す',
            onPress: () =>
              confirmPriceAndSaveReplenish(replenishAmount, priceNumber, 'reset_cycle'),
          },
        ],
      );
      return;
    }

    Alert.alert(
      '補充を保存しますか？',
      `${formatDisplayDate(replenishDate)}の補充として記録します。`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '保存する',
          onPress: () => confirmPriceAndSaveReplenish(replenishAmount, priceNumber),
        },
      ],
    );
  };

  const confirmPriceAndSaveReplenish = (
    amountNumber: number,
    priceNumber: number | undefined,
    lastingDaysReplenishMode: LastingDaysReplenishMode = 'add_remaining',
  ) => {
    if (savingReplenish) return;
    if (priceNumber !== item.price) {
      Alert.alert(
        '商品価格を更新しますか？',
        `補充価格を${priceNumber === undefined ? '未入力' : `${priceNumber.toLocaleString()}円`}で記録します。商品に設定済みの価格も更新しますか？`,
        [
          {
            text: '更新しない',
            onPress: () =>
              void saveReplenish(true, amountNumber, priceNumber, false, lastingDaysReplenishMode),
          },
          {
            text: '更新する',
            onPress: () =>
              void saveReplenish(true, amountNumber, priceNumber, true, lastingDaysReplenishMode),
          },
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
    if (savingReplenish) return;
    setSavingReplenish(true);
    try {
      const history: PurchaseHistory = {
        id: createId('history'),
        inventoryItemId: item.id,
        itemName: item.name,
        recordType: 'replenishment',
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
      const nextItem = await replenishInventoryItem(
        itemForReplenish,
        history,
        resetOpenedDate,
        lastingDaysReplenishMode,
      );
      const items = await getInventoryItems();
      await scheduleInventoryNotifications(items, settings);
      setItem(nextItem);
      closeReplenish();
      resetStockEditFields(nextItem);
      await recordReviewEligibleAction('replenish_save');
    } catch (error) {
      Alert.alert(
        '保存できませんでした',
        error instanceof Error ? error.message : '時間をおいてもう一度お試しください。',
      );
    } finally {
      setSavingReplenish(false);
    }
  };

  const submitPastPurchaseHistory = () => {
    if (savingHistoryAdd) return;
    const priceNumber = parseOptionalNumber(historyPrice);
    if (historyPrice.trim() && (priceNumber === undefined || priceNumber < 0)) {
      Alert.alert('入力を確認してください', '価格は0以上の数字で入力してください。');
      return;
    }
    Alert.alert(
      '購入履歴を追加しますか？',
      `${formatDisplayDate(historyDate)}の購入として記録します。`,
      [
        { text: 'キャンセル', style: 'cancel' },
        { text: '追加する', onPress: () => void savePastPurchaseHistory(priceNumber) },
      ],
    );
  };

  const savePastPurchaseHistory = async (priceNumber: number | undefined) => {
    if (savingHistoryAdd) return;
    const history: PurchaseHistory = {
      id: createId('history'),
      inventoryItemId: item.id,
      itemName: item.name,
      recordType: 'manual',
      purchasedAt: historyDate,
      amount: item.amount,
      unit: item.unit,
      price: priceNumber,
      memo: historyMemo.trim() || undefined,
      createdAt: nowIso(),
    };
    setSavingHistoryAdd(true);
    try {
      await addPurchaseHistory(history);
      setShowHistoryAdd(false);
      setHistoryPrice('');
      setHistoryMemo('');
      Alert.alert('追加しました', '購入履歴に追加しました。');
    } catch (error) {
      Alert.alert(
        '追加できませんでした',
        error instanceof Error ? error.message : '時間をおいてもう一度お試しください。',
      );
    } finally {
      setSavingHistoryAdd(false);
    }
  };

  const saveStockEdit = async () => {
    if (savingStockEdit) return;
    const priceNumber = parseOptionalNumber(editPrice);
    const amountNumber = parseOptionalNumber(editAmount);
    const dailyUsageNumber = parseOptionalNumber(editDailyUsage);
    const lastingDaysNumber = parseOptionalNumber(editLastingDays);

    if (!editName.trim()) {
      Alert.alert('入力を確認してください', '商品名は必須です。');
      return;
    }
    if (editPrice.trim() && (priceNumber === undefined || priceNumber < 0)) {
      Alert.alert('入力を確認してください', '価格は0以上の数字で入力してください。');
      return;
    }
    if (editAmount.trim() && (amountNumber === undefined || amountNumber < 0)) {
      Alert.alert('入力を確認してください', '内容量は0以上の数字で入力してください。');
      return;
    }
    if (editEstimationMode === 'usage' && (!amountNumber || amountNumber <= 0)) {
      Alert.alert('入力を確認してください', '内容量は0より大きくしてください。');
      return;
    }
    if (editEstimationMode === 'usage' && (!dailyUsageNumber || dailyUsageNumber <= 0)) {
      Alert.alert('入力を確認してください', '1日あたりの消費量は0より大きくしてください。');
      return;
    }
    if (editEstimationMode === 'lasting_days' && (!lastingDaysNumber || lastingDaysNumber <= 0)) {
      Alert.alert('入力を確認してください', '使い切る日数は0より大きくしてください。');
      return;
    }
    const didChangeUsageBasis =
      editEstimationMode === 'usage' &&
      (editEstimationMode !== (item.estimationMode ?? 'usage') ||
        amountNumber !== item.amount ||
        dailyUsageNumber !== item.dailyUsage ||
        editUnit !== item.unit ||
        editPurchaseDate !== item.purchaseDate);
    const didChangeLastingDaysBasis =
      editEstimationMode === 'lasting_days' &&
      (editEstimationMode !== (item.estimationMode ?? 'usage') ||
        amountNumber !== item.amount ||
        lastingDaysNumber !== item.lastingDays ||
        editUnit !== item.unit ||
        editPurchaseDate !== item.purchaseDate);
    const shouldRecalculateEstimatedEndDate = didChangeUsageBasis || didChangeLastingDaysBasis;

    const nextItem: InventoryItem = {
      ...item,
      name: editName.trim(),
      category: editCategory,
      price: priceNumber,
      estimationMode: editEstimationMode,
      amount:
        editEstimationMode === 'purchase_frequency' || editEstimationMode === 'no_estimate'
          ? item.amount
          : (amountNumber ?? 0),
      unit:
        editEstimationMode === 'purchase_frequency' || editEstimationMode === 'no_estimate'
          ? item.unit
          : editUnit,
      dailyUsage: editEstimationMode === 'usage' ? dailyUsageNumber : undefined,
      lastingDays: editEstimationMode === 'lasting_days' ? lastingDaysNumber : undefined,
      purchaseDate: editPurchaseDate,
      estimatedEndDate:
        editEstimationMode === 'no_estimate'
          ? undefined
          : editEstimationMode === 'purchase_frequency'
            ? item.estimationMode === 'purchase_frequency'
              ? item.estimatedEndDate
              : undefined
            : shouldRecalculateEstimatedEndDate
              ? undefined
              : item.estimatedEndDate,
      purchaseFrequencyDays:
        editEstimationMode === 'purchase_frequency' && item.estimationMode === 'purchase_frequency'
          ? item.purchaseFrequencyDays
          : undefined,
      notifyBeforeDays: editEstimationMode === 'no_estimate' ? [] : editNotifyBeforeDays,
      memo: editMemo.trim() || undefined,
      updatedAt: nowIso(),
    };
    if (editEstimationMode === 'lasting_days') {
      nextItem.estimatedEndDate = calculateEstimatedEndDate(nextItem);
    }
    setSavingStockEdit(true);
    try {
      if (
        editEstimationMode === 'purchase_frequency' &&
        item.estimationMode !== 'purchase_frequency'
      ) {
        const history = await getPurchaseHistory();
        const prediction = calculatePurchaseFrequencyPrediction(item.id, history);
        nextItem.estimatedEndDate = prediction?.estimatedEndDate;
        nextItem.purchaseFrequencyDays = prediction?.averageIntervalDays;
      }
      await saveInventoryItem(nextItem);
      const [items, settings] = await Promise.all([getInventoryItems(), getSettings()]);
      await scheduleInventoryNotifications(items, settings);
      const savedItem = await getInventoryItem(item.id);
      if (savedItem) {
        setItem(savedItem);
        resetStockEditFields(savedItem);
      }
      setShowStockEdit(false);
    } catch (error) {
      Alert.alert(
        '保存できませんでした',
        error instanceof Error ? error.message : '時間をおいてもう一度お試しください。',
      );
    } finally {
      setSavingStockEdit(false);
    }
  };

  const openPurchaseLinkEdit = () => {
    resetPurchaseLinkFields(item);
    setPurchaseLinkErrors({});
    setShowPurchaseLinkEdit(true);
  };

  const savePurchaseLinks = async () => {
    if (savingPurchaseLinks) return;
    const nextErrors: PurchaseLinkErrors = {};
    if (!isValidOptionalAmazonUrl(editAmazonUrl.trim() || undefined)) {
      nextErrors.amazon = 'AmazonのURLを入力してください。';
    }
    if (!isValidOptionalRakutenUrl(editRakutenUrl.trim() || undefined)) {
      nextErrors.rakuten = '楽天のURLを入力してください。';
    }
    if (!isValidOptionalYahooShoppingUrl(editYahooUrl.trim() || undefined)) {
      nextErrors.yahoo = 'YahooショッピングのURLを入力してください。';
    }
    if (!isValidOptionalUrl(editOtherUrl.trim() || undefined)) {
      nextErrors.other = 'URLは http:// または https:// で始めてください。';
    }
    setPurchaseLinkErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      Alert.alert('入力を確認してください', '各ストアに合ったURLを入力してください。');
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
    setSavingPurchaseLinks(true);
    try {
      await saveInventoryItem(nextItem);
      setItem(nextItem);
      resetPurchaseLinkFields(nextItem);
      setPurchaseLinkErrors({});
      setShowPurchaseLinkEdit(false);
    } catch (error) {
      Alert.alert(
        '保存できませんでした',
        error instanceof Error ? error.message : '時間をおいてもう一度お試しください。',
      );
    } finally {
      setSavingPurchaseLinks(false);
    }
  };

  const switchToLastingDays = () => {
    if (switchingEstimationMode) return;
    if (!purchaseFrequencyDays) {
      Alert.alert(
        'まだ切り替えできません',
        '購入頻度が計算されてから切り替えできます。先に補充を記録してください。',
      );
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
            setSwitchingEstimationMode(true);
            try {
              const nextItem: InventoryItem = {
                ...item,
                estimationMode: 'lasting_days',
                lastingDays: purchaseFrequencyDays,
                dailyUsage: undefined,
                estimatedEndDate: undefined,
                purchaseFrequencyDays: undefined,
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
            } catch (error) {
              Alert.alert(
                '切り替えできませんでした',
                error instanceof Error ? error.message : '時間をおいてもう一度お試しください。',
              );
            } finally {
              setSwitchingEstimationMode(false);
            }
          },
        },
      ],
    );
  };

  const buy = async (shop: ShopType) => {
    const opened = await openPurchaseUrl(item, shop);
    if (!opened) Alert.alert('URLが未登録です', '編集画面から購入URLを登録できます。');
    if (opened) {
      openReplenish();
    }
  };

  return (
    <ScrollView
      ref={scrollViewRef}
      contentContainerStyle={styles.container}
      automaticallyAdjustKeyboardInsets
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="never"
    >
      <AppCard style={styles.card}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            disabled={imageUploading}
            onPress={() => void selectProductIcon()}
            style={({ pressed }) => [
              styles.productImageButton,
              pressed && styles.productImagePressed,
            ]}
          >
            {item.imageUrl ? (
              <Image
                source={{ uri: item.imageUrl }}
                style={styles.productImage}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.productImagePlaceholder}>
                <Text style={styles.productImagePlaceholderText}>画像</Text>
              </View>
            )}
            <Text style={styles.productImageEditText}>{imageUploading ? '保存中' : '変更'}</Text>
          </Pressable>
          <View style={styles.titleWrap}>
            <Text style={styles.title}>{item.name}</Text>
            <Text style={styles.sub}>
              {catNames
                ? `${catNames} ・ ${categoryLabels[item.category]}`
                : categoryLabels[item.category]}
            </Text>
          </View>
          <StatusBadge status={status} label={statusLabel} />
        </View>
        <View style={styles.metrics}>
          <Metric
            label="残り日数"
            value={
              predictionState === 'disabled'
                ? '表示なし'
                : predictionState === 'learning'
                  ? '学習中'
                  : remainingDays === undefined
                    ? '未計算'
                    : `${Math.max(0, remainingDays)}日`
            }
          />
          <Metric
            label={predictionState === 'learning' ? '予測方法' : '残量'}
            value={predictionState === 'learning' ? '購入間隔' : remainingStockLabel}
          />
        </View>
        {predictionState === 'learning' ? (
          <Text style={styles.hint}>設定は不要です。補充記録から買い時を自動で予測します。</Text>
        ) : null}
        {predictionState !== 'disabled' && predictionState !== 'learning' ? (
          <AppButton
            title={showQuickAdjust ? '調整を閉じる' : '残り日数・残量を調整'}
            variant="secondary"
            disabled={savingQuickAdjust}
            onPress={showQuickAdjust ? closeQuickAdjust : openQuickAdjust}
          />
        ) : null}
        {showQuickAdjust && predictionState !== 'learning' ? (
          <View style={styles.quickAdjustPanel}>
            <View style={styles.inlineActions}>
              <AppButton
                title="残り日数で調整"
                variant={quickAdjustMode === 'days' ? 'primary' : 'secondary'}
                onPress={() => setQuickAdjustMode('days')}
                style={styles.inlineAction}
              />
              {item.estimationMode !== 'purchase_frequency' ? (
                <AppButton
                  title="残量で調整"
                  variant={quickAdjustMode === 'amount' ? 'primary' : 'secondary'}
                  onPress={() => setQuickAdjustMode('amount')}
                  style={styles.inlineAction}
                />
              ) : null}
            </View>
            {quickAdjustMode === 'days' ? (
              <AppTextInput
                label="現在の残り日数"
                value={quickRemainingDays}
                onChangeText={setQuickRemainingDays}
                keyboardType="numeric"
                placeholder="例：5"
              />
            ) : null}
            {item.estimationMode !== 'purchase_frequency' ? (
              quickAdjustMode === 'amount' ? (
                <AppTextInput
                  label={`現在の残量（${unitLabels[item.unit]}）`}
                  value={quickRemainingAmount}
                  onChangeText={setQuickRemainingAmount}
                  keyboardType="decimal-pad"
                  placeholder="例：120"
                />
              ) : null
            ) : (
              <Text style={styles.hint}>
                購入頻度から自動計算中の商品は、残り日数だけ調整できます。
              </Text>
            )}
            {item.estimationMode === 'lasting_days' ? (
              <Text style={styles.hint}>
                {quickAdjustMode === 'amount'
                  ? '保存すると、内容量と使い切る日数から残り日数も反映します。'
                  : '保存すると、内容量と使い切る日数から残量も反映します。'}
              </Text>
            ) : null}
            {!item.estimationMode || item.estimationMode === 'usage' ? (
              <Text style={styles.hint}>
                {quickAdjustMode === 'amount'
                  ? '保存すると、残量と消費ペースから残り日数も反映します。'
                  : '保存すると、残り日数と消費ペースから残量も反映します。'}
              </Text>
            ) : null}
            <View style={styles.inlineActions}>
              <AppButton
                title={savingQuickAdjust ? '保存中...' : '保存'}
                loading={savingQuickAdjust}
                onPress={() => void saveQuickAdjust()}
                style={styles.inlineAction}
              />
              <AppButton
                title="キャンセル"
                variant="secondary"
                disabled={savingQuickAdjust}
                onPress={closeQuickAdjust}
                style={styles.inlineAction}
              />
            </View>
          </View>
        ) : null}
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
                    if (savingStockEdit) return;
                    resetStockEditFields(item);
                    setShowStockEdit(false);
                  }
                : openStockEdit
            }
            disabled={savingStockEdit}
            style={styles.editButton}
          />
        </View>
        {showStockEdit ? (
          <>
            <AppTextInput
              label="商品名"
              value={editName}
              onChangeText={setEditName}
              requirement="required"
              placeholder="例：いつものカリカリ"
            />
            <View style={styles.unitBox}>
              <Text style={styles.fieldTitle}>カテゴリ</Text>
              <View style={styles.inlineActions}>
                {categories.map((option) => (
                  <AppButton
                    key={option.value}
                    title={option.label}
                    variant={editCategory === option.value ? 'primary' : 'secondary'}
                    selected={editCategory === option.value}
                    onPress={() => setEditCategory(option.value)}
                    style={styles.categoryButton}
                  />
                ))}
              </View>
            </View>
            <AppTextInput
              label="価格"
              value={editPrice}
              onChangeText={setEditPrice}
              keyboardType="numeric"
            />
            <DatePickerField
              label="購入日"
              value={editPurchaseDate}
              onChange={setEditPurchaseDate}
              requirement="required"
            />
            <View style={styles.unitBox}>
              <Text style={styles.fieldTitle}>残り日数の計算方法</Text>
              <View style={styles.inlineActions}>
                {estimationModeOptions.map((option) => (
                  <AppButton
                    key={option.value}
                    title={option.label}
                    variant={editEstimationMode === option.value ? 'primary' : 'secondary'}
                    onPress={() => setEditEstimationMode(option.value)}
                    style={styles.estimationButton}
                  />
                ))}
              </View>
            </View>
            {editEstimationMode !== 'purchase_frequency' && editEstimationMode !== 'no_estimate' ? (
              <>
                <AppTextInput
                  label={`内容量（${unitLabels[editUnit]}）`}
                  requirement={editEstimationMode === 'lasting_days' ? 'optional' : undefined}
                  value={editAmount}
                  onChangeText={setEditAmount}
                  keyboardType="decimal-pad"
                />
                <View style={styles.unitBox}>
                  <Text style={styles.fieldTitle}>単位</Text>
                  <View style={styles.inlineActions}>
                    {units.map((unit) => (
                      <AppButton
                        key={unit}
                        title={unitLabels[unit]}
                        variant={editUnit === unit ? 'primary' : 'secondary'}
                        onPress={() => setEditUnit(unit)}
                        style={styles.unitButton}
                      />
                    ))}
                  </View>
                </View>
              </>
            ) : null}
            {editEstimationMode === 'usage' ? (
              <AppTextInput
                label={`消費ペース（${unitLabels[editUnit]}/日）`}
                value={editDailyUsage}
                onChangeText={setEditDailyUsage}
                keyboardType="decimal-pad"
              />
            ) : null}
            {editEstimationMode === 'lasting_days' ? (
              <AppTextInput
                label="使い切る日数"
                value={editLastingDays}
                onChangeText={setEditLastingDays}
                keyboardType="numeric"
              />
            ) : null}
            {editEstimationMode === 'purchase_frequency' ? (
              <Text style={styles.hint}>
                補充を2回記録すると予測を開始し、その後は補充日の間隔から自動で更新します。
              </Text>
            ) : null}
            <View style={styles.unitBox}>
              <Text style={styles.fieldTitle}>通知タイミング</Text>
              <View style={styles.inlineActions}>
                {editableNotifyDays.map((day) => {
                  const isSelected = editNotifyBeforeDays.includes(day);
                  return (
                    <AppButton
                      key={day}
                      title={`${isSelected ? '通知あり' : '通知なし'}・残り${day}日`}
                      variant={isSelected ? 'primary' : 'secondary'}
                      onPress={() => toggleEditNotifyBeforeDay(day)}
                      style={styles.notifyButton}
                    />
                  );
                })}
              </View>
            </View>
            <AppTextInput
              label="メモ"
              value={editMemo}
              onChangeText={setEditMemo}
              multiline
              placeholder="メモ"
              style={styles.memo}
            />
            <AppButton
              title={savingStockEdit ? '保存中...' : '保存'}
              loading={savingStockEdit}
              onPress={() => void saveStockEdit()}
            />
          </>
        ) : (
          <>
            <Info label="商品名" value={item.name} />
            <Info label="カテゴリ" value={categoryLabels[item.category]} />
            <Info
              label="価格"
              value={item.price === undefined ? '未入力' : `${item.price.toLocaleString()}円`}
            />
            <Info label="購入日" value={formatDisplayDate(item.purchaseDate)} />
            <Info
              label="推定終了日"
              value={
                predictionState === 'learning'
                  ? '補充記録から自動予測'
                  : formatDisplayDate(item.estimatedEndDate)
              }
            />
            <Info label="残り日数の計算方法" value={estimationLabel} />
            <Info label="通知タイミング" value={formatNotifyBeforeDays(item.notifyBeforeDays)} />
            {predictionState !== 'learning' ? (
              <>
                <Info label="内容量" value={contentAmountLabel} />
                <Info label="残量" value={remainingStockLabel} />
              </>
            ) : null}
            {item.estimationMode === 'lasting_days' ? (
              <Info
                label="使い切る日数"
                value={item.lastingDays === undefined ? '未設定' : `${item.lastingDays}日`}
              />
            ) : null}
            {item.estimationMode === 'purchase_frequency' ? (
              <>
                <Info
                  label="現在の購入頻度"
                  value={
                    purchaseFrequencyDays === undefined
                      ? '補充履歴を学習中'
                      : `${purchaseFrequencyDays}日ごと`
                  }
                />
                {purchaseFrequencyDays !== undefined ? (
                  <AppButton
                    title="使い切る日数方式に切り替える"
                    variant="secondary"
                    disabled={switchingEstimationMode}
                    loading={switchingEstimationMode}
                    onPress={switchToLastingDays}
                  />
                ) : null}
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
          scrollToActionTarget();
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
                      if (savingPurchaseLinks) return;
                      resetPurchaseLinkFields(item);
                      setPurchaseLinkErrors({});
                      setShowPurchaseLinkEdit(false);
                    }
                  : openPurchaseLinkEdit
              }
              disabled={savingPurchaseLinks}
              style={styles.editButton}
            />
          </View>
          <Text style={styles.affiliate}>リンクにはアフィリエイトが含まれる場合があります</Text>
          {showPurchaseLinkEdit ? (
            <>
              <AppTextInput
                label="Amazon URL"
                value={editAmazonUrl}
                onChangeText={(value) => {
                  setEditAmazonUrl(value);
                  setPurchaseLinkErrors((currentErrors) => ({
                    ...currentErrors,
                    amazon: undefined,
                  }));
                }}
                keyboardType="url"
                autoCapitalize="none"
                error={purchaseLinkErrors.amazon}
              />
              <AppTextInput
                label="楽天 URL"
                value={editRakutenUrl}
                onChangeText={(value) => {
                  setEditRakutenUrl(value);
                  setPurchaseLinkErrors((currentErrors) => ({
                    ...currentErrors,
                    rakuten: undefined,
                  }));
                }}
                keyboardType="url"
                autoCapitalize="none"
                error={purchaseLinkErrors.rakuten}
              />
              <AppTextInput
                label="Yahoo URL"
                value={editYahooUrl}
                onChangeText={(value) => {
                  setEditYahooUrl(value);
                  setPurchaseLinkErrors((currentErrors) => ({
                    ...currentErrors,
                    yahoo: undefined,
                  }));
                }}
                keyboardType="url"
                autoCapitalize="none"
                error={purchaseLinkErrors.yahoo}
              />
              <AppTextInput
                label="その他URL"
                value={editOtherUrl}
                onChangeText={(value) => {
                  setEditOtherUrl(value);
                  setPurchaseLinkErrors((currentErrors) => ({
                    ...currentErrors,
                    other: undefined,
                  }));
                }}
                keyboardType="url"
                autoCapitalize="none"
                error={purchaseLinkErrors.other}
              />
              <AppButton
                title={savingPurchaseLinks ? '保存中...' : 'URLを保存'}
                loading={savingPurchaseLinks}
                onPress={() => void savePurchaseLinks()}
              />
            </>
          ) : (
            <View style={styles.actionGrid}>
              <PurchaseButton
                label="Amazon"
                configured={Boolean(getPurchaseUrl(item, 'amazon'))}
                saved={hasSavedPurchaseUrl(item, 'amazon')}
                onPress={() => void buy('amazon')}
              />
              <PurchaseButton
                label="楽天"
                configured={Boolean(getPurchaseUrl(item, 'rakuten'))}
                saved={hasSavedPurchaseUrl(item, 'rakuten')}
                onPress={() => void buy('rakuten')}
              />
              <PurchaseButton
                label="Yahoo"
                configured={Boolean(getPurchaseUrl(item, 'yahoo'))}
                saved={hasSavedPurchaseUrl(item, 'yahoo')}
                onPress={() => void buy('yahoo')}
              />
              <PurchaseButton
                label="その他"
                configured={Boolean(getPurchaseUrl(item, 'other'))}
                saved={hasSavedPurchaseUrl(item, 'other')}
                onPress={() => void buy('other')}
              />
            </View>
          )}
        </AppCard>
      </View>

      <View
        style={styles.bottomActions}
        onLayout={(event) => {
          bottomActionsYRef.current = event.nativeEvent.layout.y;
        }}
      >
        <AppButton title="在庫の補充を記録する" onPress={openReplenish} />
        {showReplenish ? (
          <View
            onLayout={(event) => {
              replenishCardYRef.current = event.nativeEvent.layout.y;
              scrollToActionTarget();
              if (!shouldScrollToReplenishRef.current) return;
              shouldScrollToReplenishRef.current = false;
              requestAnimationFrame(() => {
                scrollViewRef.current?.scrollTo({
                  y: Math.max(0, bottomActionsYRef.current + replenishCardYRef.current - 12),
                  animated: true,
                });
              });
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
              <AppTextInput
                label="価格"
                value={price}
                onChangeText={setPrice}
                keyboardType="numeric"
              />
              <AppTextInput
                label="メモ"
                value={memo}
                onChangeText={setMemo}
                multiline
                style={styles.memo}
              />
              <AppButton
                title={savingReplenish ? '保存中...' : '補充を保存'}
                loading={savingReplenish}
                onPress={submitReplenish}
              />
              <AppButton
                title="閉じる"
                variant="secondary"
                disabled={savingReplenish}
                onPress={closeReplenish}
              />
            </AppCard>
          </View>
        ) : null}
        <AppButton title="過去の購入履歴を追加" variant="secondary" onPress={openHistoryAdd} />
        {showHistoryAdd ? (
          <View
            onLayout={(event) => {
              historyCardYRef.current = event.nativeEvent.layout.y;
              if (!shouldScrollToHistoryRef.current) return;
              shouldScrollToHistoryRef.current = false;
              requestAnimationFrame(() => {
                scrollViewRef.current?.scrollTo({
                  y: Math.max(0, bottomActionsYRef.current + historyCardYRef.current - 12),
                  animated: true,
                });
              });
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
              <AppTextInput
                label="価格"
                value={historyPrice}
                onChangeText={setHistoryPrice}
                keyboardType="numeric"
              />
              <AppTextInput
                label="メモ"
                value={historyMemo}
                onChangeText={setHistoryMemo}
                multiline
                style={styles.memo}
              />
              <AppButton
                title={savingHistoryAdd ? '追加中...' : '購入履歴を追加'}
                loading={savingHistoryAdd}
                onPress={submitPastPurchaseHistory}
              />
              <AppButton
                title="閉じる"
                variant="secondary"
                disabled={savingHistoryAdd}
                onPress={closeHistoryAdd}
              />
            </AppCard>
          </View>
        ) : null}
      </View>

      <AppCard style={styles.dangerZone}>
        <Text style={styles.dangerZoneTitle}>削除</Text>
        <Text style={styles.dangerZoneText}>
          商品だけを削除します。購入履歴は購入履歴画面から削除できます。
        </Text>
        <AppButton
          title={deletingItem ? '削除中...' : 'この商品を削除'}
          variant="danger"
          loading={deletingItem}
          onPress={remove}
        />
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
  saved,
  onPress,
}: {
  label: string;
  configured: boolean;
  saved: boolean;
  onPress: () => void;
}) {
  return (
    <AppButton
      title={configured ? `${label}で${saved ? '買う' : '探す'}` : `${label} URL未設定`}
      variant={saved ? 'primary' : 'secondary'}
      disabled={!configured}
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
  if (!item.estimationMode || item.estimationMode === 'usage') {
    const remainingAmount = calculateRemainingAmount(item);
    if (remainingAmount === undefined) return `${percent}%`;
    return `${formatQuantity(remainingAmount)}${unitLabels[item.unit]}`;
  }
  return `${percent}%`;
}

function formatNotifyBeforeDays(days: number[]): string {
  if (days.length === 0) return '通知なし';
  return [...days]
    .sort((a, b) => b - a)
    .map((day) => `残り${day}日`)
    .join('・');
}

function calculateRemainingAmount(item: InventoryItem): number | undefined {
  if (!item.estimationMode || item.estimationMode === 'usage') {
    const remainingDays = calculateRemainingDays(item);
    if (remainingDays === undefined || !item.dailyUsage || item.dailyUsage <= 0) return undefined;
    return Math.min(item.amount, Math.max(0, remainingDays * item.dailyUsage));
  }
  const percent = calculateRemainingPercent(item);
  if (percent === undefined || item.amount <= 0) return undefined;
  return (item.amount * Math.max(0, percent)) / 100;
}

function formatQuantity(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(Math.round(value * 10) / 10);
}

function getReplenishAmount(item: InventoryItem): number {
  return item.amount;
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
  quickAdjustPanel: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    gap: 10,
    paddingTop: 12,
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
  hint: {
    color: colors.subText,
    fontSize: 12,
    lineHeight: 18,
  },
  fieldTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  unitBox: {
    gap: 8,
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
  unitButton: {
    minHeight: 42,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  categoryButton: {
    flexGrow: 1,
    minHeight: 42,
    minWidth: 130,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  estimationButton: {
    flexGrow: 1,
    minHeight: 42,
    minWidth: 150,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  notifyButton: {
    flexGrow: 1,
    minHeight: 42,
    minWidth: 140,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  memo: {
    minHeight: 80,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
});
