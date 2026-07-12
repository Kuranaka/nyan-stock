import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { addDays, format, parseISO } from 'date-fns';
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';

import { AppButton } from '@/components/AppButton';
import { AppCard } from '@/components/AppCard';
import { AppTextInput } from '@/components/AppTextInput';
import { DatePickerField } from '@/components/DatePickerField';
import { categories, defaultUnitByCategory, unitLabels, units } from '@/constants/categories';
import { colors } from '@/constants/colors';
import { getCats } from '@/features/cats/catStorage';
import { Cat } from '@/features/cats/catTypes';
import {
  getInventoryItem,
  getInventoryItems,
  saveInventoryItem,
} from '@/features/inventory/inventoryStorage';
import { getInventoryCatIds } from '@/features/inventory/inventoryLogic';
import {
  InventoryCategory,
  InventoryEstimationMode,
  InventoryItem,
  InventoryUnit,
} from '@/features/inventory/inventoryTypes';
import { scheduleInventoryNotifications } from '@/features/notifications/notificationService';
import { usePreventUnsavedChanges } from '@/hooks/usePreventUnsavedChanges';
import { hasIconUploadStorage, pickAndUploadIcon, saveIconReference } from '@/features/media/iconUpload';
import {
  findProductsByKeywordAsync,
  getProductMasterImageUrl,
  getProductMasterBrands,
  productCategoryLabels,
  productCategoryToInventoryCategory,
  productUnitToInventoryUnit,
  warmProductMasterCache,
} from '@/features/products/productMaster';
import { ProductCategory, ProductMaster } from '@/features/products/productTypes';
import { collectUserProductSuggestion } from '@/features/products/userProductSuggestionService';
import { getSettings, updateSettings } from '@/features/settings/settingsStorage';
import {
  canCreateInventoryItem,
  freePlanInventoryLimit,
  getSubscriptionEntitlement,
} from '@/features/subscription/subscriptionService';
import { nowIso, todayIso } from '@/utils/date';
import {
  createId,
  isValidOptionalAmazonUrl,
  isValidOptionalRakutenUrl,
  isValidOptionalUrl,
  isValidOptionalYahooShoppingUrl,
  parseOptionalNumber,
} from '@/utils/validation';

type FormErrors = Partial<Record<'name' | 'amount' | 'dailyUsage' | 'lastingDays' | 'price' | 'url' | 'imageUrl', string>>;
type FormErrorKey = keyof FormErrors;
type AddMethod = 'master' | 'manual' | undefined;
type ProductCategoryFilter = ProductCategory | 'all';
type FormSnapshot = {
  targetCatIds: string[];
  productMasterId?: string;
  imageUrl?: string;
  price: string;
  name: string;
  category: InventoryCategory;
  amount: string;
  unit: InventoryUnit;
  purchaseDate: string;
  dailyUsage: string;
  lastingDays: string;
  estimationMode: InventoryEstimationMode;
  notifyBeforeDays: number[];
  amazon: string;
  rakuten: string;
  yahoo: string;
  other: string;
  memo: string;
};

const masterPageSize = 10;
const visibleBrandLimit = 8;
const defaultNotifyBeforeDays = [7, 3, 1];
const productCategoryOptions: { value: ProductCategoryFilter; label: string }[] = [
  { value: 'all', label: 'すべて' },
  ...Object.entries(productCategoryLabels).map(([value, label]) => ({
    value: value as ProductCategory,
    label,
  })),
];

export default function InventoryFormScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const scrollViewRef = useRef<ScrollView>(null);
  const formFieldYRefs = useRef<Partial<Record<FormErrorKey | 'estimation', number>>>({});
  const masterResultsYRef = useRef(0);
  const scrollOffsetYRef = useRef(0);
  const pendingMasterSearchScrollYRef = useRef<number | undefined>(undefined);
  const initialFormSnapshotRef = useRef<FormSnapshot | undefined>(undefined);
  const pendingScrollToNameRef = useRef(false);
  const [draftItemId] = useState(() => createId('item'));
  const [cats, setCats] = useState<Cat[]>([]);
  const [selectedCatId, setSelectedCatId] = useState<string | undefined>();
  const [targetCatIds, setTargetCatIds] = useState<string[]>([]);
  const [current, setCurrent] = useState<InventoryItem | undefined>();
  const [addMethod, setAddMethod] = useState<AddMethod>('master');
  const [productMasterId, setProductMasterId] = useState<string | undefined>();
  const [imageUrl, setImageUrl] = useState<string | undefined>();
  const [imageUploading, setImageUploading] = useState(false);
  const [price, setPrice] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState<InventoryCategory>('dry_food');
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState<InventoryUnit>('g');
  const [purchaseDate, setPurchaseDate] = useState(todayIso());
  const [dailyUsage, setDailyUsage] = useState('');
  const [lastingDays, setLastingDays] = useState('');
  const [estimationMode, setEstimationMode] = useState<InventoryEstimationMode>('purchase_frequency');
  const [notifyBeforeDays, setNotifyBeforeDays] = useState<number[]>(defaultNotifyBeforeDays);
  const [amazon, setAmazon] = useState('');
  const [rakuten, setRakuten] = useState('');
  const [yahoo, setYahoo] = useState('');
  const [other, setOther] = useState('');
  const [memo, setMemo] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [masterSearchKeyword, setMasterSearchKeyword] = useState('');
  const [masterCategoryFilter, setMasterCategoryFilter] = useState<ProductCategoryFilter>('all');
  const [showMasterCategoryOptions, setShowMasterCategoryOptions] = useState(false);
  const [masterBrandFilter, setMasterBrandFilter] = useState<string>('all');
  const [showMasterBrandOptions, setShowMasterBrandOptions] = useState(false);
  const [masterBrandOptions, setMasterBrandOptions] = useState<string[]>([]);
  const [masterBrandKeyword, setMasterBrandKeyword] = useState('');
  const [masterBrandExpanded, setMasterBrandExpanded] = useState(false);
  const [masterSearchResults, setMasterSearchResults] = useState<ProductMaster[]>([]);
  const [masterResultPage, setMasterResultPage] = useState(0);
  const [masterSearchMessage, setMasterSearchMessage] = useState('');
  const [masterSearchLoading, setMasterSearchLoading] = useState(false);
  const [formInitialized, setFormInitialized] = useState(false);
  const [savingForm, setSavingForm] = useState(false);

  const scrollToY = useCallback((y: number) => {
    setTimeout(() => {
      scrollViewRef.current?.scrollTo({
        y: Math.max(y - 12, 0),
        animated: true,
      });
    }, 100);
  }, []);

  const setFormFieldY = useCallback((field: FormErrorKey | 'estimation') => {
    return (event: LayoutChangeEvent) => {
      const nextY = event.nativeEvent.layout.y;
      formFieldYRefs.current[field] = nextY;
      if (field === 'name' && pendingScrollToNameRef.current) {
        pendingScrollToNameRef.current = false;
        scrollToY(nextY);
      }
    };
  }, [scrollToY]);

  const scrollToFirstFormError = useCallback(
    (nextErrors: FormErrors) => {
      const firstErrorField = (['name', 'imageUrl', 'amount', 'dailyUsage', 'lastingDays', 'url', 'price'] as FormErrorKey[]).find(
        (field) => Boolean(nextErrors[field]),
      );
      if (!firstErrorField) return;
      const scrollField: FormErrorKey | 'estimation' =
        firstErrorField === 'amount' || firstErrorField === 'dailyUsage' || firstErrorField === 'lastingDays'
          ? 'estimation'
          : firstErrorField;
      scrollToY(formFieldYRefs.current[scrollField] ?? 0);
    },
    [scrollToY],
  );

  const scrollToMasterResults = useCallback(() => {
    requestAnimationFrame(() => {
      scrollViewRef.current?.scrollTo({
        y: Math.max(masterResultsYRef.current - 12, 0),
        animated: true,
      });
    });
  }, []);

  const restoreMasterSearchScrollPosition = useCallback(() => {
    const scrollY = pendingMasterSearchScrollYRef.current;
    if (scrollY === undefined) return;
    pendingMasterSearchScrollYRef.current = undefined;
    requestAnimationFrame(() => {
      scrollViewRef.current?.scrollTo({ y: scrollY, animated: false });
    });
  }, []);

  const changeMasterResultPage = useCallback(
    (nextPage: number) => {
      setMasterResultPage(nextPage);
      scrollToMasterResults();
    },
    [scrollToMasterResults],
  );

  const formSnapshot = useMemo<FormSnapshot>(
    () => ({
      targetCatIds,
      productMasterId,
      imageUrl,
      price,
      name,
      category,
      amount,
      unit,
      purchaseDate,
      dailyUsage,
      lastingDays,
      estimationMode,
      notifyBeforeDays,
      amazon,
      rakuten,
      yahoo,
      other,
      memo,
    }),
    [
      amazon,
      amount,
      category,
      dailyUsage,
      estimationMode,
      imageUrl,
      lastingDays,
      memo,
      name,
      notifyBeforeDays,
      other,
      price,
      productMasterId,
      purchaseDate,
      rakuten,
      targetCatIds,
      unit,
      yahoo,
    ],
  );

  const hasUnsavedChanges = useMemo(() => {
    const initialSnapshot = initialFormSnapshotRef.current;
    if (!formInitialized || !initialSnapshot) return false;
    return JSON.stringify(initialSnapshot) !== JSON.stringify(formSnapshot);
  }, [formInitialized, formSnapshot]);

  const confirmDiscardChanges = useCallback(
    (onDiscard: () => void) => {
      if (!hasUnsavedChanges) {
        onDiscard();
        return;
      }
      Alert.alert('編集内容を破棄しますか？', '保存していない編集内容は消えます。', [
        { text: '戻る', style: 'cancel' },
        { text: '破棄する', style: 'destructive', onPress: onDiscard },
      ]);
    },
    [hasUnsavedChanges],
  );

  const goBackWithDiscardConfirmation = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const allowRemoval = usePreventUnsavedChanges(hasUnsavedChanges, confirmDiscardChanges);

  useEffect(() => {
    if (!formInitialized || initialFormSnapshotRef.current) return;
    initialFormSnapshotRef.current = formSnapshot;
  }, [formInitialized, formSnapshot]);

  useFocusEffect(
    useCallback(() => {
      async function load() {
        initialFormSnapshotRef.current = undefined;
        setFormInitialized(false);
        const settings = await getSettings();
        const nextCats = await getCats();
        setCats(nextCats);
        const fallbackCatId = nextCats.some((cat) => cat.id === settings.selectedCatId)
          ? settings.selectedCatId
          : nextCats[0]?.id;
        setSelectedCatId(fallbackCatId);
        setTargetCatIds((currentIds) => {
          const validIds = currentIds.filter((catId) => nextCats.some((cat) => cat.id === catId));
          return validIds.length > 0 ? validIds : fallbackCatId ? [fallbackCatId] : [];
        });
        if (!id) {
          setCurrent(undefined);
          setAddMethod('master');
          setMasterSearchKeyword('');
          setMasterCategoryFilter('all');
          setMasterBrandFilter('all');
          setMasterSearchResults([]);
          setMasterResultPage(0);
          setMasterSearchMessage('');
          setMasterSearchLoading(true);
          setFormInitialized(true);

          // Keep the first render small, then prepare the full master for
          // subsequent keyword, category, and brand searches.
          void warmProductMasterCache();

          void findProductsByKeywordAsync('', { limit: masterPageSize })
            .then((results) => {
              setMasterSearchResults(results);
              setMasterResultPage(0);
              setMasterSearchMessage(
                results.length === 0
                  ? '商品マスタに該当する商品が見つかりませんでした。'
                  : `${results.length}件の候補が見つかりました。`,
              );
            })
            .catch(() => {
              setMasterSearchMessage('商品マスタを読み込めませんでした。検索し直してください。');
            })
            .finally(() => {
              setMasterSearchLoading(false);
            });
          return;
        }
        const item = await getInventoryItem(id);
        if (!item) {
          setFormInitialized(true);
          return;
        }
        setCurrent(item);
        setAddMethod('manual');
        setProductMasterId(item.productMasterId);
        setImageUrl(item.imageUrl);
        setPrice(item.price?.toString() ?? '');
        setSelectedCatId(item.catId);
        setTargetCatIds(getInventoryCatIds(item));
        setName(item.name);
        setMasterSearchKeyword(item.name);
        setCategory(item.category);
        setAmount(String(item.amount));
        setUnit(item.unit);
        setPurchaseDate(item.purchaseDate);
        setDailyUsage(item.dailyUsage?.toString() ?? '');
        setLastingDays(item.lastingDays?.toString() ?? '');
        setEstimationMode(item.estimationMode ?? (item.estimatedEndDate && !item.dailyUsage ? 'lasting_days' : 'usage'));
        setNotifyBeforeDays(item.notifyBeforeDays);
        setAmazon(item.purchaseLinks.amazon ?? '');
        setRakuten(item.purchaseLinks.rakuten ?? '');
        setYahoo(item.purchaseLinks.yahoo ?? '');
        setOther(item.purchaseLinks.other ?? '');
        setMemo(item.memo ?? '');
        setFormInitialized(true);
      }
      void load();
  }, [id]),
  );

  useEffect(() => {
    if (!formInitialized) return;
    if (addMethod !== 'master') return;
    let isActive = true;
    const timeout = setTimeout(() => {
      async function run() {
        const keyword = masterSearchKeyword.trim();
        setMasterSearchLoading(true);
        try {
          const isInitialPage = !keyword && masterBrandFilter === 'all' && masterCategoryFilter === 'all';
          const results = await findProductsByKeywordAsync(keyword, {
            brand: masterBrandFilter === 'all' ? undefined : masterBrandFilter,
            category: masterCategoryFilter === 'all' ? undefined : masterCategoryFilter,
            limit: isInitialPage ? masterPageSize : null,
          });
          if (!isActive) return;
          pendingMasterSearchScrollYRef.current = scrollOffsetYRef.current;
          setMasterSearchResults(results);
          setMasterResultPage(0);
          setMasterSearchMessage(
            results.length === 0
              ? '商品マスタに該当する商品が見つかりませんでした。'
              : `${results.length}件の候補が見つかりました。`,
          );
        } finally {
          if (isActive) setMasterSearchLoading(false);
        }
      }
      void run();
    }, 250);
    return () => {
      isActive = false;
      clearTimeout(timeout);
    };
  }, [addMethod, formInitialized, masterBrandFilter, masterCategoryFilter, masterSearchKeyword]);

  const visibleBrandOptions = useMemo(() => {
    const normalizedKeyword = masterBrandKeyword.trim().normalize('NFKC').toLowerCase();
    const filteredBrands = normalizedKeyword
      ? masterBrandOptions.filter((brand) => brand.normalize('NFKC').toLowerCase().includes(normalizedKeyword))
      : masterBrandOptions;
    if (normalizedKeyword || masterBrandExpanded) return filteredBrands;
    return filteredBrands.slice(0, visibleBrandLimit);
  }, [masterBrandExpanded, masterBrandKeyword, masterBrandOptions]);

  const masterTotalPages = Math.max(Math.ceil(masterSearchResults.length / masterPageSize), 1);
  const masterVisibleResults = useMemo(
    () => masterSearchResults.slice(masterResultPage * masterPageSize, (masterResultPage + 1) * masterPageSize),
    [masterResultPage, masterSearchResults],
  );
  const masterResultRange = useMemo(() => {
    if (masterSearchResults.length === 0) return '';
    const start = masterResultPage * masterPageSize + 1;
    const end = Math.min(start + masterPageSize - 1, masterSearchResults.length);
    return `${masterSearchResults.length}件中 ${start}〜${end}件を表示`;
  }, [masterResultPage, masterSearchResults.length]);

  const selectCategory = (next: InventoryCategory) => {
    setCategory(next);
    setUnit(defaultUnitByCategory[next]);
  };

  const toggleNotify = (day: number) => {
    setNotifyBeforeDays((currentDays) =>
      currentDays.includes(day)
        ? currentDays.filter((value) => value !== day)
        : [...currentDays, day].sort((a, b) => b - a),
    );
  };

  const toggleTargetCat = (catId: string) => {
    setTargetCatIds((currentIds) => {
      if (currentIds.includes(catId)) {
        if (currentIds.length === 1) return currentIds;
        const nextIds = currentIds.filter((currentCatId) => currentCatId !== catId);
        setSelectedCatId(nextIds[0]);
        return nextIds;
      }
      const nextIds = [...currentIds, catId];
      setSelectedCatId(nextIds[0]);
      return nextIds;
    });
  };

  const changeEstimationMode = (nextMode: InventoryEstimationMode) => {
    setEstimationMode(nextMode);
    if (nextMode === 'no_estimate') {
      setNotifyBeforeDays([]);
    }
    setErrors((currentErrors) => ({
      ...currentErrors,
      amount: undefined,
      dailyUsage: undefined,
      lastingDays: undefined,
    }));
  };

  const openProductMasterPicker = async () => {
    setAddMethod('master');
    setMasterSearchLoading(true);
    try {
      const results = await findProductsByKeywordAsync('', {
        category: masterCategoryFilter === 'all' ? undefined : masterCategoryFilter,
        brand: masterBrandFilter === 'all' ? undefined : masterBrandFilter,
        limit:
          masterCategoryFilter === 'all' && masterBrandFilter === 'all'
            ? masterPageSize
            : null,
      });
      setMasterSearchResults(results);
      setMasterResultPage(0);
      setMasterSearchMessage(results.length === 0 ? '' : `${results.length}件の候補が見つかりました。`);
    } finally {
      setMasterSearchLoading(false);
    }
  };

  const validate = () => {
    const nextErrors: FormErrors = {};
    const amountNumber = parseOptionalNumber(amount);
    const dailyUsageNumber = parseOptionalNumber(dailyUsage);
    const lastingDaysNumber = parseOptionalNumber(lastingDays);
    const priceNumber = parseOptionalNumber(price);
    if (!name.trim()) nextErrors.name = '商品名は必須です。';
    if (price.trim() && (priceNumber === undefined || priceNumber < 0)) {
      nextErrors.price = '価格は0以上の数字で入力してください。';
    }
    if (estimationMode === 'usage') {
      if (!amountNumber || amountNumber <= 0) nextErrors.amount = '内容量は0より大きくしてください。';
      if (!dailyUsageNumber || dailyUsageNumber <= 0) {
        nextErrors.dailyUsage = '1日あたりの消費量は0より大きくしてください。';
      }
    }
    if (estimationMode === 'lasting_days' && (!lastingDaysNumber || lastingDaysNumber <= 0)) {
      nextErrors.lastingDays = '使い切る日数は0より大きくしてください。';
    }
    if (!isValidOptionalAmazonUrl(amazon)) {
      nextErrors.url = 'Amazon URLにはAmazonのURLを入力してください。';
    } else if (!isValidOptionalRakutenUrl(rakuten)) {
      nextErrors.url = '楽天 URLには楽天のURLを入力してください。';
    } else if (!isValidOptionalYahooShoppingUrl(yahoo)) {
      nextErrors.url = 'Yahoo URLにはYahooショッピングのURLを入力してください。';
    } else if (!isValidOptionalUrl(other)) {
      nextErrors.url = 'その他URLは http:// または https:// で始めてください。';
    }
    if (!isValidOptionalUrl(imageUrl)) {
      nextErrors.imageUrl = '画像URLは http:// または https:// で始めてください。';
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      scrollToFirstFormError(nextErrors);
      return false;
    }
    return true;
  };

  const refreshProductMasterBrands = async (categoryFilter: ProductCategoryFilter) => {
    const brands = await getProductMasterBrands({
      category: categoryFilter === 'all' ? undefined : categoryFilter,
    });
    setMasterBrandOptions(brands);
  };

  const changeMasterCategoryFilter = async (nextCategory: ProductCategoryFilter) => {
    setMasterCategoryFilter(nextCategory);
    setShowMasterCategoryOptions(false);
    setMasterBrandFilter('all');
    setMasterBrandKeyword('');
    setMasterBrandExpanded(false);
    setShowMasterBrandOptions(false);
    await refreshProductMasterBrands(nextCategory);
    if (addMethod === 'master') {
      await searchProductMasters({ category: nextCategory, brand: 'all' });
    } else {
      setMasterSearchResults([]);
      setMasterResultPage(0);
      setMasterSearchMessage('');
    }
  };

  const changeMasterBrandFilter = async (nextBrand: string) => {
    setMasterBrandFilter(nextBrand);
    setMasterBrandKeyword('');
    setMasterBrandExpanded(false);
    setShowMasterBrandOptions(false);
    if (addMethod === 'master') {
      await searchProductMasters({ brand: nextBrand });
    }
  };

  const searchProductMasters = async (
    overrides: { category?: ProductCategoryFilter; brand?: string; keyword?: string } = {},
  ) => {
    const keyword = masterSearchKeyword.trim();
    const nextCategory = overrides.category ?? masterCategoryFilter;
    const nextBrand = overrides.brand ?? masterBrandFilter;
    setMasterSearchLoading(true);
    try {
      const results = await findProductsByKeywordAsync(overrides.keyword ?? keyword, {
        brand: nextBrand === 'all' ? undefined : nextBrand,
        category: nextCategory === 'all' ? undefined : nextCategory,
        limit:
          !(overrides.keyword ?? keyword).trim() && nextBrand === 'all' && nextCategory === 'all'
            ? masterPageSize
            : null,
      });
      setMasterSearchKeyword(overrides.keyword ?? keyword);
      setMasterSearchResults(results);
      setMasterResultPage(0);
      setMasterSearchMessage(
        results.length === 0
          ? '商品マスタに該当する商品が見つかりませんでした。'
          : `${results.length}件の候補が見つかりました。`,
      );
    } finally {
      setMasterSearchLoading(false);
    }
  };

  const applyProductMaster = useCallback((product: ProductMaster) => {
    const nextCategory = productCategoryToInventoryCategory(product.category);
    const nextImageUrl = getProductMasterImageUrl(product);
    const shouldCopyAmount = Boolean(product.amount !== undefined && product.unit && (product.janCode || product.gtin));
    setProductMasterId(product.id);
    setImageUrl(nextImageUrl);
    setName(getProductNameWithBrand(product));
    setCategory(nextCategory);
    setAmount(shouldCopyAmount ? String(product.amount) : '');
    setEstimationMode('purchase_frequency');
    setUnit(shouldCopyAmount && product.unit ? productUnitToInventoryUnit(product.unit) : defaultUnitByCategory[nextCategory]);
    setAddMethod(undefined);
    setMasterSearchResults([]);
    setMasterResultPage(0);
    setMasterSearchMessage('');
    setShowMasterCategoryOptions(false);
    setShowMasterBrandOptions(false);
    setErrors((currentErrors) => ({ ...currentErrors, name: undefined, amount: undefined, url: undefined }));
    pendingScrollToNameRef.current = true;
  }, []);

  const selectProductIcon = async () => {
    if (!hasIconUploadStorage()) {
      Alert.alert('保存先が未設定です', 'SupabaseのURLとAnon Keyを設定すると、アイコンをサーバーに保存できます。');
      return;
    }

    try {
      setImageUploading(true);
      const result = await pickAndUploadIcon({ kind: 'products', ownerId: current?.id ?? draftItemId });
      if (result.status === 'uploaded') {
        setImageUrl(result.url);
        setErrors((currentErrors) => ({ ...currentErrors, imageUrl: undefined }));
      }
    } catch (error) {
      Alert.alert('アイコンを保存できませんでした', error instanceof Error ? error.message : '時間をおいてもう一度お試しください。');
    } finally {
      setImageUploading(false);
    }
  };

  const save = async () => {
    if (savingForm) return;
    const primaryCatId = targetCatIds[0] ?? selectedCatId;
    if (!validate() || !primaryCatId) return;
    if (!current) {
      const entitlement = await getSubscriptionEntitlement();
      const latestItems = await getInventoryItems();
      if (!canCreateInventoryItem(entitlement, latestItems.length)) {
        Alert.alert(
          `無料プランでは在庫は${freePlanInventoryLimit}件までです`,
          'Plusにすると、在庫を無制限に登録でき、広告も非表示になります。',
          [
            { text: 'あとで', style: 'cancel' },
            { text: 'Plusを見る', onPress: () => router.push('/subscription') },
          ],
        );
        return;
      }
    }
    const now = nowIso();
    const amountNumber = parseOptionalNumber(amount);
    const priceNumber = parseOptionalNumber(price);
    const dailyUsageNumber = estimationMode === 'usage' ? parseOptionalNumber(dailyUsage) : undefined;
    const lastingDaysNumber = parseOptionalNumber(lastingDays);
    const estimatedEndDate = estimationMode === 'lasting_days' && lastingDaysNumber
      ? format(addDays(parseISO(purchaseDate), lastingDaysNumber), 'yyyy-MM-dd')
      : undefined;
    const purchaseLinks = {
      amazon: amazon.trim() || undefined,
      rakuten: rakuten.trim() || undefined,
      yahoo: yahoo.trim() || undefined,
      other: other.trim() || undefined,
    };
    const itemId = current?.id ?? draftItemId;
    setSavingForm(true);
    try {
      await saveInventoryItem({
        id: itemId,
        catId: primaryCatId,
        sharedCatIds: targetCatIds.length > 1 ? targetCatIds.slice(1) : undefined,
        productMasterId,
        imageUrl: imageUrl?.trim() || undefined,
        price: priceNumber,
        name: name.trim(),
        category,
        amount: estimationMode === 'usage' ? amountNumber ?? 0 : 0,
        unit,
        dailyUsage: dailyUsageNumber,
        lastingDays: estimationMode === 'lasting_days' ? lastingDaysNumber : undefined,
        purchaseDate,
        openedDate: current?.openedDate,
        estimatedEndDate,
        estimationMode,
        notifyBeforeDays: estimationMode === 'no_estimate' ? [] : notifyBeforeDays,
        purchaseLinks,
        memo: memo.trim() || undefined,
        createdAt: current?.createdAt ?? now,
        updatedAt: now,
      });
      await saveIconReference('inventory_item', itemId, imageUrl?.trim() || undefined);
      if (!productMasterId && !current) {
        await collectUserProductSuggestion({
          suggestion: {
            id: createId('suggestion'),
            name: name.trim(),
            category,
            purchaseUrl: purchaseLinks.amazon ?? purchaseLinks.rakuten ?? purchaseLinks.yahoo ?? purchaseLinks.other,
            imageUrl: imageUrl?.trim() || undefined,
            status: 'pending',
            createdAt: now,
            updatedAt: now,
          },
          inventoryItemId: itemId,
          purchaseLinks,
        });
      }
      await updateSettings({ selectedCatId: primaryCatId });
      const [items, settings] = await Promise.all([getInventoryItems(), getSettings()]);
      await scheduleInventoryNotifications(items, settings);
      allowRemoval(() => router.back());
    } catch (error) {
      Alert.alert('保存できませんでした', error instanceof Error ? error.message : '時間をおいてもう一度お試しください。');
    } finally {
      setSavingForm(false);
    }
  };

  if (formInitialized && cats.length === 0) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <AppCard style={styles.searchCard}>
          <Text style={styles.sectionTitle}>先に猫プロフィールを登録してください</Text>
          <Text style={styles.hint}>商品は猫ごとに在庫を記録します。まず猫の名前を登録してから、商品を追加できます。</Text>
          <AppButton
            title="猫プロフィールを登録する"
            onPress={() => {
              allowRemoval(() => router.replace('/cat-profile'));
            }}
          />
        </AppCard>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      ref={scrollViewRef}
      contentContainerStyle={styles.container}
      automaticallyAdjustKeyboardInsets
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      onScroll={(event) => {
        scrollOffsetYRef.current = event.nativeEvent.contentOffset.y;
      }}
      onContentSizeChange={restoreMasterSearchScrollPosition}
      scrollEventThrottle={16}
    >
      {cats.length > 1 ? (
        <>
          <FieldLabel label="対象の猫（複数選択可）" requirement="required" />
          <View style={styles.wrapRow}>
            {cats.map((cat) => (
              <AppButton
                key={cat.id}
                title={cat.name}
                variant={targetCatIds.includes(cat.id) ? 'primary' : 'secondary'}
                onPress={() => toggleTargetCat(cat.id)}
              />
            ))}
          </View>
          {targetCatIds.length > 1 ? (
            <Text style={styles.hint}>選択した猫で同じ在庫を共有します。補充や残り日数も共通で更新されます。</Text>
          ) : null}
        </>
      ) : null}

      {!current ? (
        <AppCard style={styles.searchCard}>
          <Text style={styles.sectionTitle}>追加方法</Text>
          <View style={styles.wrapRow}>
            <AppButton
              title="アプリに登録済みの商品から選択する"
              variant={addMethod === 'master' ? 'primary' : 'secondary'}
              onPress={() => void openProductMasterPicker()}
            />
            <AppButton
              title="手入力で追加"
              variant={addMethod === 'manual' ? 'primary' : 'secondary'}
              onPress={() => {
                setAddMethod('manual');
                setProductMasterId(undefined);
                setImageUrl(undefined);
              }}
            />
          </View>
          {addMethod === 'master' ? (
            <>
              <AppTextInput
                label="商品名・ブランド名で検索"
                value={masterSearchKeyword}
                onChangeText={setMasterSearchKeyword}
                placeholder="例：銀のスプーン、デオトイレ"
              />
              <View style={styles.filterControls}>
                <AppButton
                  title={`カテゴリで選ぶ：${getProductCategoryFilterLabel(masterCategoryFilter)}`}
                  variant={showMasterCategoryOptions ? 'primary' : 'secondary'}
                  onPress={() => setShowMasterCategoryOptions((current) => !current)}
                />
                {masterBrandOptions.length > 0 ? (
                  <AppButton
                    title={`ブランドで絞る：${masterBrandFilter === 'all' ? 'すべて' : masterBrandFilter}`}
                    variant={showMasterBrandOptions ? 'primary' : 'secondary'}
                    onPress={() => setShowMasterBrandOptions((current) => !current)}
                  />
                ) : null}
              </View>
              {showMasterCategoryOptions ? (
                <View style={styles.wrapRow}>
                  {productCategoryOptions.map((option) => (
                    <AppButton
                      key={option.value}
                      title={option.label}
                      variant={masterCategoryFilter === option.value ? 'primary' : 'secondary'}
                      onPress={() => void changeMasterCategoryFilter(option.value)}
                    />
                  ))}
                </View>
              ) : null}
              {masterBrandOptions.length > 0 ? (
                <>
                  {showMasterBrandOptions ? (
                    <>
                      <AppTextInput
                        label="ブランドを検索"
                        value={masterBrandKeyword}
                        onChangeText={(value) => {
                          setMasterBrandKeyword(value);
                          setMasterBrandExpanded(false);
                        }}
                        placeholder="例：銀のスプーン"
                      />
                      <View style={styles.wrapRow}>
                        <AppButton
                          title="すべて"
                          variant={masterBrandFilter === 'all' ? 'primary' : 'secondary'}
                          onPress={() => void changeMasterBrandFilter('all')}
                        />
                        {visibleBrandOptions.map((brand) => (
                          <AppButton
                            key={brand}
                            title={brand}
                            variant={masterBrandFilter === brand ? 'primary' : 'secondary'}
                            onPress={() => void changeMasterBrandFilter(brand)}
                          />
                        ))}
                      </View>
                      {!masterBrandKeyword.trim() && masterBrandOptions.length > visibleBrandLimit ? (
                        <AppButton
                          title={masterBrandExpanded ? 'ブランドを少なく表示' : `ブランドをもっと表示（${masterBrandOptions.length}件）`}
                          variant="secondary"
                          onPress={() => setMasterBrandExpanded((current) => !current)}
                        />
                      ) : null}
                      {masterBrandKeyword.trim() && visibleBrandOptions.length === 0 ? (
                        <Text style={styles.resultSummary}>該当するブランドがありません。</Text>
                      ) : null}
                    </>
                  ) : null}
                </>
              ) : null}
              {masterSearchLoading ? <Text style={styles.resultSummary}>検索中...</Text> : null}
              {masterSearchMessage ? <Text style={styles.resultSummary}>{masterSearchMessage}</Text> : null}
              <View onLayout={(event) => {
                masterResultsYRef.current = event.nativeEvent.layout.y;
              }}>
                {masterResultRange ? <Text style={styles.resultSummary}>{masterResultRange}</Text> : null}
              </View>
              {masterVisibleResults.map((product) => (
                <View key={product.id} style={styles.searchResult}>
                  {(() => {
                    const productImageUrl = getProductMasterImageUrl(product);
                    return (
                      <View style={styles.productResultBody}>
                        {productImageUrl ? (
                          <Image source={{ uri: productImageUrl }} style={styles.productThumbnail} resizeMode="contain" />
                        ) : null}
                        <View style={styles.productResultText}>
                          <Text style={styles.resultName}>{product.name}</Text>
                          <Text style={styles.resultMeta}>
                            {[
                              product.brand,
                              productCategoryLabels[product.category],
                            ]
                              .filter(Boolean)
                              .join(' ・ ')}
                          </Text>
                          <View style={styles.badgeRow}>
                            {getProductSourceLabels(product).map((label) => (
                              <Text key={label} style={styles.sourceBadge}>{label}</Text>
                            ))}
                          </View>
                        </View>
                      </View>
                    );
                  })()}
                  <AppButton
                    title="この商品を登録する"
                    variant="secondary"
                    onPress={() => applyProductMaster(product)}
                  />
                </View>
              ))}
              {masterSearchResults.length > masterPageSize ? (
                <View style={styles.paginationRow}>
                  <AppButton
                    title="前の候補"
                    variant="secondary"
                    disabled={masterResultPage === 0}
                    onPress={() => changeMasterResultPage(Math.max(masterResultPage - 1, 0))}
                    style={styles.paginationButton}
                  />
                  <Text style={styles.paginationText}>
                    {masterResultPage + 1} / {masterTotalPages}
                  </Text>
                  <AppButton
                    title="次の候補"
                    variant="secondary"
                    disabled={masterResultPage >= masterTotalPages - 1}
                    onPress={() => changeMasterResultPage(Math.min(masterResultPage + 1, masterTotalPages - 1))}
                    style={styles.paginationButton}
                  />
                </View>
              ) : null}
            </>
          ) : null}
        </AppCard>
      ) : null}

      <View onLayout={setFormFieldY('name')}>
        <AppTextInput label="商品名" value={name} onChangeText={setName} error={errors.name} requirement="required" />
      </View>

      <View onLayout={setFormFieldY('imageUrl')}>
        <AppTextInput
          label="画像URL"
          value={imageUrl ?? ''}
          onChangeText={(value) => setImageUrl(value)}
          keyboardType="url"
          autoCapitalize="none"
          error={errors.imageUrl}
          requirement="optional"
        />
      </View>
      <View style={styles.iconPickerRow}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.iconPreview} resizeMode="cover" />
        ) : (
          <View style={styles.iconPreviewPlaceholder}>
            <Text style={styles.iconPreviewText}>商品</Text>
          </View>
        )}
        <View style={styles.iconPickerActions}>
          <AppButton
            title={imageUploading ? 'アップロード中...' : imageUrl ? '別の商品アイコンに変更' : '商品アイコンを選ぶ'}
            variant="secondary"
            disabled={imageUploading}
            onPress={() => void selectProductIcon()}
          />
          {imageUrl ? <AppButton title="削除" variant="ghost" onPress={() => setImageUrl(undefined)} /> : null}
        </View>
      </View>

      <FieldLabel label="カテゴリ" requirement="required" />
      <View style={styles.wrapRow}>
        {categories.map((option) => (
          <AppButton
            key={option.value}
            title={option.label}
            variant={category === option.value ? 'primary' : 'secondary'}
            onPress={() => selectCategory(option.value)}
          />
        ))}
      </View>

      <DatePickerField
        label="購入日"
        value={purchaseDate}
        onChange={setPurchaseDate}
        requirement="required"
      />

      <View onLayout={setFormFieldY('estimation')}>
        <AppCard style={styles.searchCard}>
          <FieldLabel label="残り日数の計算方法" requirement="required" />
          <View style={styles.wrapRow}>
            <AppButton
              title="使い切る日数"
              variant={estimationMode === 'lasting_days' ? 'primary' : 'secondary'}
              onPress={() => changeEstimationMode('lasting_days')}
            />
            <AppButton
              title="内容量と1日の使用量"
              variant={estimationMode === 'usage' ? 'primary' : 'secondary'}
              onPress={() => changeEstimationMode('usage')}
            />
            <AppButton
              title="購入頻度から自動計算"
              variant={estimationMode === 'purchase_frequency' ? 'primary' : 'secondary'}
              onPress={() => changeEstimationMode('purchase_frequency')}
            />
            <AppButton
              title="計算しない（不定期購入）"
              variant={estimationMode === 'no_estimate' ? 'primary' : 'secondary'}
              onPress={() => changeEstimationMode('no_estimate')}
            />
          </View>

          {estimationMode === 'usage' ? (
            <>
              <View style={styles.twoColumns}>
                <AppTextInput
                  label="内容量"
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="decimal-pad"
                  error={errors.amount}
                  requirement="required"
                />
                <View style={styles.unitBox}>
                  <FieldLabel label="単位" requirement="required" />
                  <View style={styles.wrapRow}>
                    {units.map((option) => (
                      <AppButton
                        key={option}
                        title={unitLabels[option]}
                        variant={unit === option ? 'primary' : 'secondary'}
                        onPress={() => setUnit(option)}
                      />
                    ))}
                  </View>
                </View>
              </View>
              <AppTextInput
                label="1日あたりの消費量"
                value={dailyUsage}
                onChangeText={setDailyUsage}
                keyboardType="decimal-pad"
                error={errors.dailyUsage}
                requirement="required"
              />
            </>
          ) : null}

          {estimationMode === 'lasting_days' ? (
            <AppTextInput
              label="使い切る日数"
              value={lastingDays}
              onChangeText={setLastingDays}
              keyboardType="numeric"
              error={errors.lastingDays}
              requirement="required"
            />
          ) : null}

          {estimationMode === 'purchase_frequency' ? (
            <Text style={styles.hint}>補充を記録すると、購入日どうしの間隔から次回購入日を自動推定します。</Text>
          ) : null}
          {estimationMode === 'no_estimate' ? (
            <Text style={styles.hint}>不定期に購入する用品向けです。残り日数の計算と在庫通知は行いません。</Text>
          ) : null}
        </AppCard>
      </View>

      {estimationMode !== 'no_estimate' ? (
        <>
          <FieldLabel label="通知タイミング" requirement="optional" />
          <View style={styles.wrapRow}>
            {defaultNotifyBeforeDays.map((day) => {
              const isSelected = notifyBeforeDays.includes(day);
              return (
                <AppButton
                  key={day}
                  title={`${isSelected ? '通知あり' : '通知なし'}・残り${day}日`}
                  variant={isSelected ? 'primary' : 'secondary'}
                  onPress={() => toggleNotify(day)}
                />
              );
            })}
          </View>
        </>
      ) : null}

      <View onLayout={setFormFieldY('price')}>
        <AppTextInput
          label="価格"
          value={price}
          onChangeText={setPrice}
          keyboardType="numeric"
          error={errors.price}
          requirement="optional"
        />
      </View>

      <View onLayout={setFormFieldY('url')}>
        <AppTextInput label="Amazon URL" value={amazon} onChangeText={setAmazon} error={errors.url} requirement="optional" />
      </View>
      <AppTextInput label="楽天 URL" value={rakuten} onChangeText={setRakuten} requirement="optional" />
      <AppTextInput label="Yahoo URL" value={yahoo} onChangeText={setYahoo} requirement="optional" />
      <AppTextInput label="その他URL" value={other} onChangeText={setOther} requirement="optional" />

      <AppTextInput label="メモ" value={memo} onChangeText={setMemo} multiline style={styles.memo} requirement="optional" />

      <AppButton title={savingForm ? '保存中...' : '保存する'} loading={savingForm} onPress={() => void save()} />
      <AppButton
        title="キャンセル"
        variant="secondary"
        disabled={savingForm}
        onPress={goBackWithDiscardConfirmation}
      />
    </ScrollView>
  );
}

function FieldLabel({ label, requirement }: { label: string; requirement: 'required' | 'optional' }) {
  return (
    <View style={styles.labelRow}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.requirementBadge, requirement === 'required' ? styles.requiredBadge : styles.optionalBadge]}>
        {requirement === 'required' ? '必須' : '任意'}
      </Text>
    </View>
  );
}

function getProductSourceLabels(product: ProductMaster): string[] {
  const labels: Record<string, string> = {
    rakuten: '楽天',
    yahoo: 'Yahoo',
    amazon: 'Amazon',
    gs1: 'GS1',
    manual: '手動',
    official: '公式',
    user: 'ユーザー',
  };
  const providers = product.sources.map((source) => labels[source.provider] ?? source.provider);
  return Array.from(new Set(providers)).slice(0, 3);
}

function getProductCategoryFilterLabel(category: ProductCategoryFilter): string {
  return category === 'all' ? 'すべて' : productCategoryLabels[category];
}

function getProductNameWithBrand(product: ProductMaster): string {
  const brand = product.brand?.trim();
  const name = product.name.trim();
  if (!brand) return name;
  return name.normalize('NFKC').toLowerCase().includes(brand.normalize('NFKC').toLowerCase())
    ? name
    : `${brand} ${name}`;
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
    padding: 18,
    paddingBottom: 40,
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  labelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  requirementBadge: {
    borderRadius: 8,
    fontSize: 11,
    fontWeight: '800',
    overflow: 'hidden',
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  requiredBadge: {
    backgroundColor: colors.dangerLight,
    color: colors.danger,
  },
  optionalBadge: {
    backgroundColor: colors.muted,
    color: colors.subText,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  searchCard: {
    gap: 12,
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 19,
  },
  resultSummary: {
    color: colors.primaryDark,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
  },
  searchResult: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    gap: 8,
    paddingTop: 12,
  },
  resultActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  resultAction: {
    flexGrow: 1,
  },
  paginationRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  paginationButton: {
    flex: 1,
    minWidth: 0,
  },
  paginationText: {
    color: colors.subText,
    fontSize: 13,
    fontWeight: '800',
    minWidth: 48,
    textAlign: 'center',
  },
  productResultBody: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
  },
  productResultText: {
    flex: 1,
    gap: 6,
    minWidth: 0,
  },
  productThumbnail: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    height: 72,
    width: 72,
  },
  iconPickerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
  },
  iconPreview: {
    backgroundColor: colors.muted,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    height: 72,
    width: 72,
  },
  iconPreviewPlaceholder: {
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    height: 72,
    justifyContent: 'center',
    width: 72,
  },
  iconPreviewText: {
    color: colors.primaryDark,
    fontSize: 14,
    fontWeight: '900',
  },
  iconPickerActions: {
    flex: 1,
    gap: 8,
  },
  resultName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
  },
  resultMeta: {
    color: colors.subText,
    fontSize: 12,
    lineHeight: 18,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  filterControls: {
    gap: 8,
  },
  sourceBadge: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    color: colors.text,
    fontSize: 11,
    fontWeight: '700',
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  wrapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  twoColumns: {
    gap: 14,
  },
  unitBox: {
    gap: 8,
  },
  hint: {
    color: colors.primaryDark,
    fontSize: 13,
    fontWeight: '700',
  },
  memo: {
    minHeight: 90,
    textAlignVertical: 'top',
    paddingTop: 12,
  },
});
