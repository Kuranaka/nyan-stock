import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
import { Cat, PetType } from '@/features/cats/catTypes';
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
import {
  hasIconUploadStorage,
  pickAndUploadIcon,
  saveIconReference,
} from '@/features/media/iconUpload';
import {
  getProductMasterImageUrl,
  getProductMasterPrice,
  getProductVariantLabel,
  getProductMasterBrands,
  petProductAmountAndUnit,
  petProductGroupLabels,
  petProductToInventoryCategory,
  productPurchaseLinksToInventoryLinks,
  searchProductMasterPageAsync,
} from '@/features/products/productMaster';
import { PetProductGroup, PetProductMaster } from '@/features/products/productTypes';
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

type FormErrors = Partial<
  Record<'name' | 'amount' | 'dailyUsage' | 'lastingDays' | 'price' | 'url' | 'imageUrl', string>
>;
type FormErrorKey = keyof FormErrors;
type AddMethod = 'master' | 'manual' | undefined;
type PetProductGroupFilter = PetProductGroup | 'all';
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
const petProductGroupOptions: { value: PetProductGroupFilter; label: string }[] = [
  { value: 'all', label: 'すべて' },
  ...Object.entries(petProductGroupLabels).map(([value, label]) => ({
    value: value as PetProductGroup,
    label,
  })),
];

export default function InventoryFormScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const scrollViewRef = useRef<ScrollView>(null);
  const formFieldYRefs = useRef<Partial<Record<FormErrorKey | 'estimation', number>>>({});
  const scrollOffsetYRef = useRef(0);
  const pendingMasterSearchScrollYRef = useRef<number | undefined>(undefined);
  const masterSearchGenerationRef = useRef(0);
  const [initialFormSnapshot, setInitialFormSnapshot] = useState<FormSnapshot | undefined>(
    undefined,
  );
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
  const [category, setCategory] = useState<InventoryCategory>('other');
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState<InventoryUnit>('piece');
  const [purchaseDate, setPurchaseDate] = useState(todayIso());
  const [dailyUsage, setDailyUsage] = useState('');
  const [lastingDays, setLastingDays] = useState('');
  const [estimationMode, setEstimationMode] =
    useState<InventoryEstimationMode>('purchase_frequency');
  const [notifyBeforeDays, setNotifyBeforeDays] = useState<number[]>(defaultNotifyBeforeDays);
  const [amazon, setAmazon] = useState('');
  const [rakuten, setRakuten] = useState('');
  const [yahoo, setYahoo] = useState('');
  const [other, setOther] = useState('');
  const [memo, setMemo] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [masterSearchKeyword, setMasterSearchKeyword] = useState('');
  const [masterPetGroupFilter, setMasterPetGroupFilter] = useState<PetProductGroupFilter>('cat');
  const [showMasterPetGroupOptions, setShowMasterPetGroupOptions] = useState(false);
  const [masterBrandFilter, setMasterBrandFilter] = useState<string>('all');
  const [showMasterBrandOptions, setShowMasterBrandOptions] = useState(false);
  const [masterBrandOptions, setMasterBrandOptions] = useState<string[]>([]);
  const [masterBrandKeyword, setMasterBrandKeyword] = useState('');
  const [masterBrandExpanded, setMasterBrandExpanded] = useState(false);
  const [masterSearchResults, setMasterSearchResults] = useState<PetProductMaster[]>([]);
  const [masterNextCursor, setMasterNextCursor] = useState<string | undefined>();
  const [masterHasMoreResults, setMasterHasMoreResults] = useState(false);
  const [masterSearchMessage, setMasterSearchMessage] = useState('');
  const [masterSearchLoading, setMasterSearchLoading] = useState(false);
  const [masterLoadMoreLoading, setMasterLoadMoreLoading] = useState(false);
  const [masterSearchRevision, setMasterSearchRevision] = useState(0);
  const [formInitialized, setFormInitialized] = useState(false);
  const [savingForm, setSavingForm] = useState(false);
  const [searchFiltersExpanded, setSearchFiltersExpanded] = useState(false);
  const [purchaseLinksExpanded, setPurchaseLinksExpanded] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(false);

  const scrollToY = useCallback((y: number) => {
    setTimeout(() => {
      scrollViewRef.current?.scrollTo({
        y: Math.max(y - 12, 0),
        animated: true,
      });
    }, 100);
  }, []);

  const setFormFieldY = useCallback(
    (field: FormErrorKey | 'estimation') => {
      return (event: LayoutChangeEvent) => {
        const nextY = event.nativeEvent.layout.y;
        formFieldYRefs.current[field] = nextY;
        if (field === 'name' && pendingScrollToNameRef.current) {
          pendingScrollToNameRef.current = false;
          scrollToY(nextY);
        }
      };
    },
    [scrollToY],
  );

  const scrollToFirstFormError = useCallback(
    (nextErrors: FormErrors) => {
      const firstErrorField = (
        [
          'name',
          'imageUrl',
          'amount',
          'dailyUsage',
          'lastingDays',
          'url',
          'price',
        ] as FormErrorKey[]
      ).find((field) => Boolean(nextErrors[field]));
      if (!firstErrorField) return;
      const scrollField: FormErrorKey | 'estimation' =
        firstErrorField === 'amount' ||
        firstErrorField === 'dailyUsage' ||
        firstErrorField === 'lastingDays'
          ? 'estimation'
          : firstErrorField;
      scrollToY(formFieldYRefs.current[scrollField] ?? 0);
    },
    [scrollToY],
  );

  const restoreMasterSearchScrollPosition = useCallback(() => {
    const scrollY = pendingMasterSearchScrollYRef.current;
    if (scrollY === undefined) return;
    pendingMasterSearchScrollYRef.current = undefined;
    requestAnimationFrame(() => {
      scrollViewRef.current?.scrollTo({ y: scrollY, animated: false });
    });
  }, []);

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
    if (!formInitialized || !initialFormSnapshot) return false;
    return JSON.stringify(initialFormSnapshot) !== JSON.stringify(formSnapshot);
  }, [formInitialized, formSnapshot, initialFormSnapshot]);

  const hasPurchaseLinks = useMemo(
    () => [amazon, rakuten, yahoo, other].some((value) => Boolean(value.trim())),
    [amazon, other, rakuten, yahoo],
  );
  const purchaseLinkProviders = useMemo(
    () =>
      [
        { label: 'Amazon', value: amazon },
        { label: '楽天', value: rakuten },
        { label: 'Yahoo', value: yahoo },
        { label: 'その他', value: other },
      ]
        .filter(({ value }) => Boolean(value.trim()))
        .map(({ label }) => label),
    [amazon, other, rakuten, yahoo],
  );
  const showInventoryFields = Boolean(current || addMethod !== 'master');

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
    if (!formInitialized || initialFormSnapshot) return;
    setInitialFormSnapshot(formSnapshot);
  }, [formInitialized, formSnapshot, initialFormSnapshot]);

  useFocusEffect(
    useCallback(() => {
      async function load() {
        setInitialFormSnapshot(undefined);
        setFormInitialized(false);
        setSearchFiltersExpanded(false);
        setPurchaseLinksExpanded(false);
        setDetailsExpanded(false);
        const settings = await getSettings();
        const nextCats = await getCats();
        setCats(nextCats);
        const fallbackCatId = nextCats.some((cat) => cat.id === settings.selectedCatId)
          ? settings.selectedCatId
          : nextCats[0]?.id;
        const initialPetGroup = petTypeToProductGroup(
          nextCats.find((cat) => cat.id === fallbackCatId)?.petType ?? 'cat',
        );
        setSelectedCatId(fallbackCatId);
        setTargetCatIds((currentIds) => {
          const validIds = currentIds.filter((catId) => nextCats.some((cat) => cat.id === catId));
          return validIds.length > 0 ? validIds : fallbackCatId ? [fallbackCatId] : [];
        });
        if (!id) {
          setCurrent(undefined);
          setAddMethod('master');
          setMasterSearchKeyword('');
          setMasterPetGroupFilter(initialPetGroup);
          setMasterBrandFilter('all');
          setCategory('other');
          setUnit(defaultUnitByCategory.other);
          setMasterSearchResults([]);
          setMasterNextCursor(undefined);
          setMasterHasMoreResults(false);
          setMasterSearchMessage('');
          setMasterSearchLoading(true);
          setFormInitialized(true);
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
        setEstimationMode(
          item.estimationMode ??
            (item.estimatedEndDate && !item.dailyUsage ? 'lasting_days' : 'usage'),
        );
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
    const searchGeneration = ++masterSearchGenerationRef.current;
    if (!formInitialized) return;
    if (addMethod !== 'master') return;
    let isActive = true;
    setMasterSearchLoading(true);
    setMasterLoadMoreLoading(false);
    setMasterSearchResults([]);
    setMasterSearchMessage('');
    setMasterNextCursor(undefined);
    setMasterHasMoreResults(false);
    const timeout = setTimeout(() => {
      async function run() {
        const keyword = masterSearchKeyword.trim();
        try {
          const page = await searchProductMasterPageAsync(keyword, {
            brand: masterBrandFilter === 'all' ? undefined : masterBrandFilter,
            petGroup: masterPetGroupFilter === 'all' ? undefined : masterPetGroupFilter,
            limit: masterPageSize,
          });
          if (!isActive || masterSearchGenerationRef.current !== searchGeneration) return;
          pendingMasterSearchScrollYRef.current = scrollOffsetYRef.current;
          setMasterSearchResults(page.products);
          setMasterNextCursor(page.nextCursor);
          setMasterHasMoreResults(page.hasMore);
          setMasterSearchMessage(
            page.products.length === 0
              ? '商品マスタに該当する商品が見つかりませんでした。'
              : `${page.products.length}件の候補を表示しています。`,
          );
        } catch {
          if (!isActive || masterSearchGenerationRef.current !== searchGeneration) return;
          setMasterSearchResults([]);
          setMasterNextCursor(undefined);
          setMasterHasMoreResults(false);
          setMasterSearchMessage('商品マスタを読み込めませんでした。検索し直してください。');
        } finally {
          if (isActive && masterSearchGenerationRef.current === searchGeneration) {
            setMasterSearchLoading(false);
          }
        }
      }
      void run();
    }, 250);
    return () => {
      isActive = false;
      clearTimeout(timeout);
      if (masterSearchGenerationRef.current === searchGeneration) {
        masterSearchGenerationRef.current += 1;
      }
    };
  }, [
    addMethod,
    formInitialized,
    masterBrandFilter,
    masterPetGroupFilter,
    masterSearchRevision,
    masterSearchKeyword,
  ]);

  useEffect(() => {
    if (!formInitialized || addMethod !== 'master') return;
    let isActive = true;
    void getProductMasterBrands({
      petGroup: masterPetGroupFilter === 'all' ? undefined : masterPetGroupFilter,
    })
      .then((brands) => {
        if (isActive) setMasterBrandOptions(brands);
      })
      .catch(() => {
        if (isActive) setMasterBrandOptions([]);
      });
    return () => {
      isActive = false;
    };
  }, [addMethod, formInitialized, masterPetGroupFilter]);

  const visibleBrandOptions = useMemo(() => {
    const normalizedKeyword = masterBrandKeyword.trim().normalize('NFKC').toLowerCase();
    const filteredBrands = normalizedKeyword
      ? masterBrandOptions.filter((brand) =>
          brand.normalize('NFKC').toLowerCase().includes(normalizedKeyword),
        )
      : masterBrandOptions;
    if (normalizedKeyword || masterBrandExpanded) return filteredBrands;
    return filteredBrands.slice(0, visibleBrandLimit);
  }, [masterBrandExpanded, masterBrandKeyword, masterBrandOptions]);

  const masterResultRange =
    masterSearchResults.length > 0 ? `${masterSearchResults.length}件を表示` : '';

  const selectCategory = (next: InventoryCategory) => {
    setCategory(next);
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

  const openProductMasterPicker = () => {
    setAddMethod('master');
    setMasterSearchRevision((currentRevision) => currentRevision + 1);
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
      if (!amountNumber || amountNumber <= 0)
        nextErrors.amount = '内容量は0より大きくしてください。';
      if (!dailyUsageNumber || dailyUsageNumber <= 0) {
        nextErrors.dailyUsage = '1日あたりの消費量は0より大きくしてください。';
      }
    }
    if (estimationMode === 'lasting_days' && (!lastingDaysNumber || lastingDaysNumber <= 0)) {
      nextErrors.lastingDays = '使い切る日数は0より大きくしてください。';
    }
    if (!isValidOptionalAmazonUrl(amazon.trim() || undefined)) {
      nextErrors.url = 'Amazon URLにはAmazonのURLを入力してください。';
    } else if (!isValidOptionalRakutenUrl(rakuten.trim() || undefined)) {
      nextErrors.url = '楽天 URLには楽天のURLを入力してください。';
    } else if (!isValidOptionalYahooShoppingUrl(yahoo.trim() || undefined)) {
      nextErrors.url = 'Yahoo URLにはYahooショッピングのURLを入力してください。';
    } else if (!isValidOptionalUrl(other.trim() || undefined)) {
      nextErrors.url = 'その他URLは http:// または https:// で始めてください。';
    }
    if (!isValidOptionalUrl(imageUrl?.trim() || undefined)) {
      nextErrors.imageUrl = '画像URLは http:// または https:// で始めてください。';
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      if (nextErrors.url) setPurchaseLinksExpanded(true);
      if (nextErrors.imageUrl || nextErrors.price) setDetailsExpanded(true);
      scrollToFirstFormError(nextErrors);
      return false;
    }
    return true;
  };

  const changeMasterPetGroupFilter = (nextPetGroup: PetProductGroupFilter) => {
    setMasterPetGroupFilter(nextPetGroup);
    setShowMasterPetGroupOptions(false);
    setMasterBrandFilter('all');
    setMasterBrandKeyword('');
    setMasterBrandExpanded(false);
    setShowMasterBrandOptions(false);
  };

  const changeMasterBrandFilter = (nextBrand: string) => {
    setMasterBrandFilter(nextBrand);
    setMasterBrandKeyword('');
    setMasterBrandExpanded(false);
    setShowMasterBrandOptions(false);
  };

  const loadMoreProductMasters = async () => {
    if (!masterHasMoreResults || !masterNextCursor || masterLoadMoreLoading) return;
    const searchGeneration = masterSearchGenerationRef.current;
    setMasterLoadMoreLoading(true);
    try {
      const page = await searchProductMasterPageAsync(masterSearchKeyword.trim(), {
        petGroup: masterPetGroupFilter === 'all' ? undefined : masterPetGroupFilter,
        brand: masterBrandFilter === 'all' ? undefined : masterBrandFilter,
        cursor: masterNextCursor,
        limit: masterPageSize,
      });
      if (masterSearchGenerationRef.current !== searchGeneration) return;
      const knownIds = new Set(masterSearchResults.map((product) => product.id));
      const newProducts = page.products.filter((product) => !knownIds.has(product.id));
      const nextProducts = [...masterSearchResults, ...newProducts];
      setMasterSearchResults(nextProducts);
      setMasterNextCursor(page.nextCursor);
      setMasterHasMoreResults(page.hasMore);
      setMasterSearchMessage(`${nextProducts.length}件の候補を表示しています。`);
    } catch {
      if (masterSearchGenerationRef.current !== searchGeneration) return;
      setMasterSearchMessage('追加の候補を読み込めませんでした。もう一度お試しください。');
    } finally {
      if (masterSearchGenerationRef.current === searchGeneration) {
        setMasterLoadMoreLoading(false);
      }
    }
  };

  const applyProductMaster = useCallback((product: PetProductMaster) => {
    const nextCategory = petProductToInventoryCategory(product);
    const nextImageUrl = getProductMasterImageUrl(product);
    const nextPrice = getProductMasterPrice(product);
    const productAmount = petProductAmountAndUnit(product);
    const purchaseLinks = productPurchaseLinksToInventoryLinks(product);
    const shouldCopyAmount = Boolean(
      productAmount.amount !== undefined && productAmount.unit && product.janCode,
    );
    setProductMasterId(product.id);
    setImageUrl(nextImageUrl);
    setPrice(nextPrice === undefined ? '' : String(nextPrice));
    setName(getProductNameWithBrand(product));
    setCategory(nextCategory);
    setAmount(shouldCopyAmount ? String(productAmount.amount) : '');
    setEstimationMode('purchase_frequency');
    setUnit(
      shouldCopyAmount && productAmount.unit
        ? productAmount.unit
        : defaultUnitByCategory[nextCategory],
    );
    setAmazon(purchaseLinks.amazon ?? '');
    setRakuten(purchaseLinks.rakuten ?? '');
    setYahoo(purchaseLinks.yahoo ?? '');
    setOther(purchaseLinks.other ?? '');
    masterSearchGenerationRef.current += 1;
    setAddMethod(undefined);
    setMasterSearchResults([]);
    setMasterNextCursor(undefined);
    setMasterHasMoreResults(false);
    setMasterSearchMessage('');
    setShowMasterPetGroupOptions(false);
    setShowMasterBrandOptions(false);
    setSearchFiltersExpanded(false);
    setPurchaseLinksExpanded(false);
    setDetailsExpanded(false);
    setErrors((currentErrors) => ({
      ...currentErrors,
      name: undefined,
      amount: undefined,
      price: undefined,
      url: undefined,
    }));
    pendingScrollToNameRef.current = true;
  }, []);

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
      const result = await pickAndUploadIcon({
        kind: 'products',
        ownerId: current?.id ?? draftItemId,
      });
      if (result.status === 'uploaded') {
        setImageUrl(result.url);
        setErrors((currentErrors) => ({ ...currentErrors, imageUrl: undefined }));
      }
    } catch (error) {
      Alert.alert(
        'アイコンを保存できませんでした',
        error instanceof Error ? error.message : '時間をおいてもう一度お試しください。',
      );
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
    const dailyUsageNumber =
      estimationMode === 'usage' ? parseOptionalNumber(dailyUsage) : undefined;
    const lastingDaysNumber = parseOptionalNumber(lastingDays);
    const purchaseFrequencyDays =
      estimationMode === 'purchase_frequency' &&
      current?.estimationMode === 'purchase_frequency' &&
      current.estimatedEndDate &&
      current.purchaseFrequencyDays &&
      current.purchaseFrequencyDays > 0
        ? current.purchaseFrequencyDays
        : undefined;
    const estimatedEndDate =
      estimationMode === 'lasting_days' && lastingDaysNumber
        ? format(addDays(parseISO(purchaseDate), lastingDaysNumber), 'yyyy-MM-dd')
        : purchaseFrequencyDays
          ? current?.estimatedEndDate
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
        amount: estimationMode === 'usage' ? (amountNumber ?? 0) : 0,
        unit,
        dailyUsage: dailyUsageNumber,
        lastingDays: estimationMode === 'lasting_days' ? lastingDaysNumber : undefined,
        purchaseDate,
        openedDate: current?.openedDate,
        estimatedEndDate,
        purchaseFrequencyDays,
        estimationMode,
        notifyBeforeDays: estimationMode === 'no_estimate' ? [] : notifyBeforeDays,
        purchaseLinks,
        memo: memo.trim() || undefined,
        createdAt: current?.createdAt ?? now,
        updatedAt: now,
      });
      await saveIconReference('inventory_item', itemId, imageUrl?.trim() || undefined);
      await updateSettings({ selectedCatId: primaryCatId });
      const [items, settings] = await Promise.all([getInventoryItems(), getSettings()]);
      await scheduleInventoryNotifications(items, settings);
      allowRemoval(() => router.back());
    } catch (error) {
      Alert.alert(
        '保存できませんでした',
        error instanceof Error ? error.message : '時間をおいてもう一度お試しください。',
      );
    } finally {
      setSavingForm(false);
    }
  };

  if (formInitialized && cats.length === 0) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <AppCard style={styles.searchCard}>
          <Text style={styles.sectionTitle}>先にペットプロフィールを登録してください</Text>
          <Text style={styles.hint}>
            商品はペットごとに在庫を記録します。まずペットを登録してから、商品を追加できます。
          </Text>
          <AppButton
            title="ペットプロフィールを登録する"
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
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="never"
      onScroll={(event) => {
        scrollOffsetYRef.current = event.nativeEvent.contentOffset.y;
      }}
      onContentSizeChange={restoreMasterSearchScrollPosition}
      scrollEventThrottle={16}
    >
      {cats.length > 1 ? (
        <>
          <FieldLabel label="対象のペット（複数選択可）" requirement="required" />
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
            <Text style={styles.hint}>
              選択したペットで同じ在庫を共有します。補充や残り日数も共通で更新されます。
            </Text>
          ) : null}
        </>
      ) : null}

      {!current ? (
        addMethod === undefined && productMasterId ? (
          <AppCard style={styles.selectedProductCard}>
            <Text style={styles.sectionEyebrow}>選択した商品</Text>
            <View style={styles.selectedProductBody}>
              {imageUrl ? (
                <Image
                  source={{ uri: imageUrl }}
                  style={styles.productThumbnail}
                  resizeMode="contain"
                />
              ) : null}
              <View style={styles.selectedProductCopy}>
                <Text style={styles.selectedProductName}>{name}</Text>
                <Text style={styles.selectedProductMeta}>商品情報を自動入力しました</Text>
              </View>
            </View>
            <AppButton
              title="商品を選び直す"
              variant="secondary"
              onPress={openProductMasterPicker}
            />
          </AppCard>
        ) : (
          <AppCard style={styles.searchCard}>
            <Text style={styles.sectionTitle}>追加方法</Text>
            <View style={styles.wrapRow}>
              <AppButton
                title="商品から選ぶ"
                variant={addMethod === 'master' ? 'primary' : 'secondary'}
                onPress={openProductMasterPicker}
              />
              <AppButton
                title="手入力"
                variant={addMethod === 'manual' ? 'primary' : 'secondary'}
                onPress={() => {
                  if (addMethod === 'manual') return;
                  setAddMethod('manual');
                  setProductMasterId(undefined);
                  setImageUrl(undefined);
                  setCategory('other');
                  setUnit(defaultUnitByCategory.other);
                  setShowMasterPetGroupOptions(false);
                  setSearchFiltersExpanded(false);
                  setPurchaseLinksExpanded(false);
                  setDetailsExpanded(false);
                }}
              />
            </View>
            {addMethod === 'master' ? (
              <>
                <AppTextInput
                  label="商品名・ブランド名で検索"
                  value={masterSearchKeyword}
                  onChangeText={setMasterSearchKeyword}
                  placeholder="例：銀のスプーン、ロイヤルカナン"
                />
                <DisclosureSection
                  title="検索条件を絞り込む"
                  hint="ペットの種類・ブランド"
                  expanded={searchFiltersExpanded}
                  onToggle={() => setSearchFiltersExpanded((expanded) => !expanded)}
                >
                  <View style={styles.filterControls}>
                    <AppButton
                      title={`ペットの種類：${getPetProductGroupFilterLabel(masterPetGroupFilter)}`}
                      variant={showMasterPetGroupOptions ? 'primary' : 'secondary'}
                      onPress={() => setShowMasterPetGroupOptions((current) => !current)}
                    />
                    {masterBrandOptions.length > 0 ? (
                      <AppButton
                        title={`ブランド：${masterBrandFilter === 'all' ? 'すべて' : masterBrandFilter}`}
                        variant={showMasterBrandOptions ? 'primary' : 'secondary'}
                        onPress={() => setShowMasterBrandOptions((current) => !current)}
                      />
                    ) : null}
                  </View>
                  {showMasterPetGroupOptions ? (
                    <View style={styles.wrapRow}>
                      {petProductGroupOptions.map((option) => (
                        <AppButton
                          key={option.value}
                          title={option.label}
                          variant={masterPetGroupFilter === option.value ? 'primary' : 'secondary'}
                          onPress={() => changeMasterPetGroupFilter(option.value)}
                        />
                      ))}
                    </View>
                  ) : null}
                  {masterBrandOptions.length > 0 && showMasterBrandOptions ? (
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
                          onPress={() => changeMasterBrandFilter('all')}
                        />
                        {visibleBrandOptions.map((brand) => (
                          <AppButton
                            key={brand}
                            title={brand}
                            variant={masterBrandFilter === brand ? 'primary' : 'secondary'}
                            onPress={() => changeMasterBrandFilter(brand)}
                          />
                        ))}
                      </View>
                      {!masterBrandKeyword.trim() &&
                      masterBrandOptions.length > visibleBrandLimit ? (
                        <AppButton
                          title={
                            masterBrandExpanded ? 'ブランドを少なく表示' : 'ブランドをもっと表示'
                          }
                          variant="secondary"
                          onPress={() => setMasterBrandExpanded((current) => !current)}
                        />
                      ) : null}
                      {masterBrandKeyword.trim() && visibleBrandOptions.length === 0 ? (
                        <Text style={styles.resultSummary}>該当するブランドがありません。</Text>
                      ) : null}
                    </>
                  ) : null}
                </DisclosureSection>
                {masterSearchLoading ? <Text style={styles.resultSummary}>検索中...</Text> : null}
                {masterSearchMessage ? (
                  <Text style={styles.resultSummary}>{masterSearchMessage}</Text>
                ) : null}
                <View>
                  {masterResultRange ? (
                    <Text style={styles.resultSummary}>{masterResultRange}</Text>
                  ) : null}
                </View>
                {masterSearchResults.map((product) => (
                  <View key={product.id} style={styles.searchResult}>
                    {(() => {
                      const productImageUrl = getProductMasterImageUrl(product);
                      const productPrice = getProductMasterPrice(product);
                      const variantLabel = getProductVariantLabel(product);
                      const needsJan = masterSearchResults.some(
                        (other) =>
                          other.id !== product.id &&
                          normalizeProductResultName(other.baseProductName) ===
                            normalizeProductResultName(product.baseProductName) &&
                          getProductVariantLabel(other) === variantLabel,
                      );
                      const displayedVariantLabel = getProductVariantLabel(product, {
                        includeJan: needsJan,
                      });
                      return (
                        <View style={styles.productResultBody}>
                          {productImageUrl ? (
                            <Image
                              source={{ uri: productImageUrl }}
                              style={styles.productThumbnail}
                              resizeMode="contain"
                            />
                          ) : null}
                          <View style={styles.productResultText}>
                            <Text style={styles.resultName}>{product.baseProductName}</Text>
                            <Text style={styles.resultMeta}>
                              {[
                                product.brand,
                                petProductGroupLabels[product.petGroup],
                                displayedVariantLabel,
                              ]
                                .filter(Boolean)
                                .join(' ・ ')}
                            </Text>
                            {productPrice !== undefined ? (
                              <Text style={styles.resultPrice}>
                                取得時価格 ¥{productPrice.toLocaleString('ja-JP')}
                              </Text>
                            ) : null}
                            <View style={styles.badgeRow}>
                              {getProductSourceLabels(product).map((label) => (
                                <Text key={label} style={styles.sourceBadge}>
                                  {label}
                                </Text>
                              ))}
                            </View>
                          </View>
                        </View>
                      );
                    })()}
                    <AppButton
                      title="この商品を登録する"
                      variant="primary"
                      onPress={() => applyProductMaster(product)}
                    />
                  </View>
                ))}
                {masterHasMoreResults ? (
                  <View style={styles.loadMoreSection}>
                    <Text style={styles.loadMoreHint}>お探しの商品が見つからない場合</Text>
                    <AppButton
                      title={`↓ 次の候補を最大${masterPageSize}件表示`}
                      variant="ghost"
                      loading={masterLoadMoreLoading}
                      disabled={masterSearchLoading}
                      onPress={() => void loadMoreProductMasters()}
                    />
                  </View>
                ) : null}
              </>
            ) : null}
          </AppCard>
        )
      ) : null}

      {showInventoryFields ? (
        <>
          <View onLayout={setFormFieldY('name')}>
            <AppTextInput
              label="商品名"
              value={name}
              onChangeText={setName}
              error={errors.name}
              requirement="required"
            />
          </View>

          <View onLayout={setFormFieldY('estimation')}>
            <AppCard style={styles.searchCard}>
              <FieldLabel label="残り日数の出し方" requirement="required" />
              <View style={styles.wrapRow}>
                <AppButton
                  title="だいたいの日数"
                  variant={estimationMode === 'lasting_days' ? 'primary' : 'secondary'}
                  onPress={() => changeEstimationMode('lasting_days')}
                />
                <AppButton
                  title="使用量から計算"
                  variant={estimationMode === 'usage' ? 'primary' : 'secondary'}
                  onPress={() => changeEstimationMode('usage')}
                />
                <AppButton
                  title="購入履歴から推定"
                  variant={estimationMode === 'purchase_frequency' ? 'primary' : 'secondary'}
                  onPress={() => changeEstimationMode('purchase_frequency')}
                />
                <AppButton
                  title="計算しない"
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
                  label="何日くらいもつ？"
                  value={lastingDays}
                  onChangeText={setLastingDays}
                  keyboardType="numeric"
                  error={errors.lastingDays}
                  requirement="required"
                />
              ) : null}

              {estimationMode === 'purchase_frequency' ? (
                <Text style={styles.hint}>
                  補充を2回記録すると、補充日の間隔から次回の買い足し時期を推定します。
                </Text>
              ) : null}
              {estimationMode === 'no_estimate' ? (
                <Text style={styles.hint}>
                  不定期に買う用品向けです。残り日数の表示と在庫通知は行いません。
                </Text>
              ) : null}
            </AppCard>
          </View>

          <View onLayout={setFormFieldY('url')}>
            <DisclosureSection
              title={hasPurchaseLinks ? '購入先URLを確認・編集' : '購入先URLを追加'}
              hint={
                purchaseLinkProviders.length > 0
                  ? `${purchaseLinkProviders.join('・')}を登録済み`
                  : 'いつもの商品ページがある場合だけ'
              }
              expanded={purchaseLinksExpanded}
              onToggle={() => setPurchaseLinksExpanded((expanded) => !expanded)}
            >
              <Text style={styles.sectionLead}>
                未入力でも商品名から各ショップを検索できます
              </Text>
              <AppTextInput
                label="Amazon URL"
                value={amazon}
                onChangeText={setAmazon}
                keyboardType="url"
                autoCapitalize="none"
                autoCorrect={false}
                requirement="optional"
              />
              <AppTextInput
                label="楽天 URL"
                value={rakuten}
                onChangeText={setRakuten}
                keyboardType="url"
                autoCapitalize="none"
                autoCorrect={false}
                requirement="optional"
              />
              <AppTextInput
                label="Yahoo URL"
                value={yahoo}
                onChangeText={setYahoo}
                keyboardType="url"
                autoCapitalize="none"
                autoCorrect={false}
                requirement="optional"
              />
              <AppTextInput
                label="その他URL"
                value={other}
                onChangeText={setOther}
                keyboardType="url"
                autoCapitalize="none"
                autoCorrect={false}
                requirement="optional"
              />
              {errors.url ? <Text style={styles.errorText}>{errors.url}</Text> : null}
            </DisclosureSection>
          </View>

          <View
            onLayout={(event) => {
              const y = event.nativeEvent.layout.y;
              formFieldYRefs.current.imageUrl = y;
              formFieldYRefs.current.price = y;
            }}
          >
            <DisclosureSection
              title="詳細設定"
              hint="カテゴリ・画像・購入日・通知など"
              expanded={detailsExpanded}
              onToggle={() => setDetailsExpanded((expanded) => !expanded)}
            >
              <Text style={styles.sectionLead}>自動設定。必要なときだけ変更できます。</Text>
              <FieldLabel label="カテゴリ" requirement="optional" />
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

              <AppTextInput
                label="画像URL"
                value={imageUrl ?? ''}
                onChangeText={(value) => setImageUrl(value)}
                keyboardType="url"
                autoCapitalize="none"
                autoCorrect={false}
                error={errors.imageUrl}
                requirement="optional"
              />
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
                    title={
                      imageUploading
                        ? 'アップロード中...'
                        : imageUrl
                          ? '別の商品アイコンに変更'
                          : '商品アイコンを選ぶ'
                    }
                    variant="secondary"
                    disabled={imageUploading}
                    onPress={() => void selectProductIcon()}
                  />
                  {imageUrl ? (
                    <AppButton
                      title="画像を削除"
                      variant="ghost"
                      onPress={() => setImageUrl(undefined)}
                    />
                  ) : null}
                </View>
              </View>

              <DatePickerField
                label="購入日"
                value={purchaseDate}
                onChange={setPurchaseDate}
                requirement="required"
              />

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

              <AppTextInput
                label="価格"
                value={price}
                onChangeText={setPrice}
                keyboardType="numeric"
                error={errors.price}
                requirement="optional"
              />

              <AppTextInput
                label="メモ"
                value={memo}
                onChangeText={setMemo}
                multiline
                style={styles.memo}
                requirement="optional"
              />
            </DisclosureSection>
          </View>

          <AppButton
            title={savingForm ? '保存中...' : '保存する'}
            loading={savingForm}
            onPress={() => void save()}
          />
          <AppButton
            title="キャンセル"
            variant="secondary"
            disabled={savingForm}
            onPress={goBackWithDiscardConfirmation}
          />
        </>
      ) : null}
    </ScrollView>
  );
}

function normalizeProductResultName(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase();
}

function DisclosureSection({
  title,
  hint,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  hint: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <View style={styles.disclosureSection}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={onToggle}
        style={({ pressed }) => [
          styles.disclosureToggle,
          pressed && styles.disclosureTogglePressed,
        ]}
      >
        <View style={styles.disclosureCopy}>
          <Text style={styles.disclosureTitle}>{title}</Text>
          <Text style={styles.disclosureHint}>{hint}</Text>
        </View>
        <Text accessibilityElementsHidden style={styles.disclosureIcon}>
          {expanded ? '−' : '+'}
        </Text>
      </Pressable>
      {expanded ? <View style={styles.disclosureContent}>{children}</View> : null}
    </View>
  );
}

function FieldLabel({
  label,
  requirement,
}: {
  label: string;
  requirement: 'required' | 'optional';
}) {
  return (
    <View style={styles.labelRow}>
      <Text style={styles.label}>{label}</Text>
      <Text
        style={[
          styles.requirementBadge,
          requirement === 'required' ? styles.requiredBadge : styles.optionalBadge,
        ]}
      >
        {requirement === 'required' ? '必須' : '任意'}
      </Text>
    </View>
  );
}

function getProductSourceLabels(product: PetProductMaster): string[] {
  const labels: Record<string, string> = {
    rakuten_ichiba: '楽天市場',
    rakuten_product_navi: '楽天製品',
    yahoo_shopping: 'Yahoo',
  };
  const providers = product.retailers.map((retailer) => labels[retailer.source] ?? retailer.source);
  return Array.from(new Set(providers)).slice(0, 3);
}

function getPetProductGroupFilterLabel(petGroup: PetProductGroupFilter): string {
  return petGroup === 'all' ? 'すべて' : petProductGroupLabels[petGroup];
}

function petTypeToProductGroup(petType: PetType): PetProductGroup {
  if (petType === 'small_mammal') return 'small_animal';
  if (petType === 'aquarium_fish') return 'aquarium';
  return petType;
}

function getProductNameWithBrand(product: PetProductMaster): string {
  const brand = product.brand?.trim();
  const name = product.baseProductName.trim() || product.name.trim();
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
  sectionEyebrow: {
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: '800',
  },
  sectionLead: {
    color: colors.subText,
    fontSize: 13,
    lineHeight: 19,
  },
  searchCard: {
    gap: 12,
  },
  selectedProductCard: {
    gap: 12,
  },
  selectedProductBody: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  selectedProductCopy: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  selectedProductName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 22,
  },
  selectedProductMeta: {
    color: colors.subText,
    fontSize: 12,
    lineHeight: 18,
  },
  disclosureSection: {
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  disclosureToggle: {
    alignItems: 'center',
    backgroundColor: colors.card,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    minHeight: 68,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  disclosureTogglePressed: {
    backgroundColor: colors.primaryLight,
  },
  disclosureCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  disclosureTitle: {
    color: colors.primaryDark,
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 21,
  },
  disclosureHint: {
    color: colors.subText,
    fontSize: 12,
    lineHeight: 18,
  },
  disclosureIcon: {
    color: colors.primaryDark,
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    width: 24,
  },
  disclosureContent: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    gap: 16,
    padding: 16,
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
  resultPrice: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
  },
  loadMoreSection: {
    alignItems: 'center',
    borderTopColor: colors.border,
    borderTopWidth: 1,
    gap: 2,
    paddingTop: 12,
  },
  loadMoreHint: {
    color: colors.subText,
    fontSize: 12,
    lineHeight: 18,
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
