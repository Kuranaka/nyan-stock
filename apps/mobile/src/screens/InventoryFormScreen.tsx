import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { addDays, parseISO } from 'date-fns';
import { Href } from 'expo-router';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

import { AppButton } from '@/components/AppButton';
import { AppCard } from '@/components/AppCard';
import { AppTextInput } from '@/components/AppTextInput';
import { DatePickerField } from '@/components/DatePickerField';
import { categories, defaultUnitByCategory, unitLabels, units } from '@/constants/categories';
import { colors } from '@/constants/colors';
import { getCats, saveCat } from '@/features/cats/catStorage';
import { Cat } from '@/features/cats/catTypes';
import {
  hasPurchaseLinkSearchApi,
  PurchaseLinkProvider,
  RakutenSearchResult,
  searchRakutenItems,
  searchYahooItemsByJanCode,
} from '@/features/ec/rakutenSearch';
import {
  getInventoryItem,
  getInventoryItems,
  saveInventoryItem,
} from '@/features/inventory/inventoryStorage';
import {
  InventoryCategory,
  InventoryEstimationMode,
  InventoryItem,
  InventoryUnit,
} from '@/features/inventory/inventoryTypes';
import { scheduleInventoryNotifications } from '@/features/notifications/notificationService';
import {
  findProductByJanCodeAsync,
  findProductsByKeywordAsync,
  getProductMasterImageUrl,
  getProductMasterBrands,
  productCategoryLabels,
  productCategoryToInventoryCategory,
  productPurchaseLinksToInventoryLinks,
  productUnitToInventoryUnit,
} from '@/features/products/productMaster';
import { ProductCategory, ProductMaster } from '@/features/products/productTypes';
import { saveUserProductSuggestion } from '@/features/products/userProductSuggestionStorage';
import { getSettings, updateSettings } from '@/features/settings/settingsStorage';
import { nowIso, todayIso } from '@/utils/date';
import { createId, isValidOptionalUrl, parseOptionalNumber } from '@/utils/validation';

type FormErrors = Partial<Record<'name' | 'amount' | 'dailyUsage' | 'lastingDays' | 'url', string>>;
type AddMethod = 'master' | 'barcode' | 'manual' | undefined;
type ProductCategoryFilter = ProductCategory | 'all';

const masterResultLimit = 20;
const visibleBrandLimit = 8;
const productCategoryOptions: { value: ProductCategoryFilter; label: string }[] = [
  { value: 'all', label: 'すべて' },
  ...Object.entries(productCategoryLabels).map(([value, label]) => ({
    value: value as ProductCategory,
    label,
  })),
];

export default function InventoryFormScreen() {
  const router = useRouter();
  const { id, barcode, scannedAt } = useLocalSearchParams<{ id?: string; barcode?: string; scannedAt?: string }>();
  const scrollViewRef = useRef<ScrollView>(null);
  const nameFieldYRef = useRef(0);
  const purchaseDateFieldYRef = useRef(0);
  const lastAppliedBarcodeRef = useRef<string | undefined>(undefined);
  const [cats, setCats] = useState<Cat[]>([]);
  const [selectedCatId, setSelectedCatId] = useState<string | undefined>();
  const [current, setCurrent] = useState<InventoryItem | undefined>();
  const [addMethod, setAddMethod] = useState<AddMethod>('master');
  const [productMasterId, setProductMasterId] = useState<string | undefined>();
  const [imageUrl, setImageUrl] = useState<string | undefined>();
  const [name, setName] = useState('');
  const [category, setCategory] = useState<InventoryCategory>('dry_food');
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState<InventoryUnit>('g');
  const [purchaseDate, setPurchaseDate] = useState(todayIso());
  const [purchaseDatePickerOpenSignal, setPurchaseDatePickerOpenSignal] = useState(0);
  const [dailyUsage, setDailyUsage] = useState('');
  const [lastingDays, setLastingDays] = useState('');
  const [estimationMode, setEstimationMode] = useState<InventoryEstimationMode>('lasting_days');
  const [notifyBeforeDays, setNotifyBeforeDays] = useState<number[]>([7, 3, 1]);
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
  const [masterSearchMessage, setMasterSearchMessage] = useState('');
  const [masterSearchLoading, setMasterSearchLoading] = useState(false);
  const [scannedBarcode, setScannedBarcode] = useState('');
  const [barcodeSearchMessage, setBarcodeSearchMessage] = useState('');
  const [barcodeSearchLoading, setBarcodeSearchLoading] = useState(false);
  const [barcodeYahooResults, setBarcodeYahooResults] = useState<RakutenSearchResult[]>([]);
  const [showPurchaseLinkSearch, setShowPurchaseLinkSearch] = useState(false);
  const [purchaseLinkProvider, setPurchaseLinkProvider] = useState<PurchaseLinkProvider>('rakuten');
  const [productSearchKeyword, setProductSearchKeyword] = useState('');
  const [productSearchResults, setProductSearchResults] = useState<RakutenSearchResult[]>([]);
  const [productSearchMessage, setProductSearchMessage] = useState('');
  const [productSearchLoading, setProductSearchLoading] = useState(false);
  const [productSearchError, setProductSearchError] = useState('');

  const scrollToNameField = useCallback(() => {
    setTimeout(() => {
      scrollViewRef.current?.scrollTo({
        y: Math.max(nameFieldYRef.current - 12, 0),
        animated: true,
      });
    }, 100);
  }, []);

  const scrollToPurchaseDateField = useCallback(() => {
    setTimeout(() => {
      scrollViewRef.current?.scrollTo({
        y: Math.max(purchaseDateFieldYRef.current - 12, 0),
        animated: true,
      });
      setPurchaseDatePickerOpenSignal((currentSignal) => currentSignal + 1);
    }, 250);
  }, []);

  useFocusEffect(
    useCallback(() => {
      async function load() {
        const settings = await getSettings();
        let nextCats = await getCats();
        if (nextCats.length === 0) {
          const now = nowIso();
          const defaultCat: Cat = {
            id: createId('cat'),
            name: 'うちの猫',
            gender: 'unknown',
            createdAt: now,
            updatedAt: now,
          };
          await saveCat(defaultCat);
          await updateSettings({ selectedCatId: defaultCat.id });
          nextCats = [defaultCat];
        }
        setCats(nextCats);
        const fallbackCatId = nextCats.some((cat) => cat.id === settings.selectedCatId)
          ? settings.selectedCatId
          : nextCats[0]?.id;
        setSelectedCatId(fallbackCatId);
        if (!id) {
          const brands = await getProductMasterBrands();
          setMasterBrandOptions(brands);
          setMasterSearchResults([]);
          setMasterSearchMessage('');
          return;
        }
        const item = await getInventoryItem(id);
        if (!item) return;
        setCurrent(item);
        setAddMethod('manual');
        setProductMasterId(item.productMasterId);
        setImageUrl(item.imageUrl);
        setSelectedCatId(item.catId);
        setName(item.name);
        setMasterSearchKeyword(item.name);
        setProductSearchKeyword(item.name);
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
      }
      void load();
  }, [id]),
  );

  useEffect(() => {
    if (addMethod !== 'master') return;
    let isActive = true;
    const timeout = setTimeout(() => {
      async function run() {
        const keyword = masterSearchKeyword.trim() || name.trim();
        setMasterSearchLoading(true);
        try {
          const results = await findProductsByKeywordAsync(keyword, {
            brand: masterBrandFilter === 'all' ? undefined : masterBrandFilter,
            category: masterCategoryFilter === 'all' ? undefined : masterCategoryFilter,
            limit: masterResultLimit,
          });
          if (!isActive) return;
          setMasterSearchResults(results);
          setMasterSearchMessage(
            results.length === 0
              ? '商品マスタに該当する商品が見つかりませんでした。'
              : `${results.length}件を表示しています。`,
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
  }, [addMethod, masterBrandFilter, masterCategoryFilter, masterSearchKeyword, name]);

  const visibleBrandOptions = useMemo(() => {
    const normalizedKeyword = masterBrandKeyword.trim().normalize('NFKC').toLowerCase();
    const filteredBrands = normalizedKeyword
      ? masterBrandOptions.filter((brand) => brand.normalize('NFKC').toLowerCase().includes(normalizedKeyword))
      : masterBrandOptions;
    if (normalizedKeyword || masterBrandExpanded) return filteredBrands;
    return filteredBrands.slice(0, visibleBrandLimit);
  }, [masterBrandExpanded, masterBrandKeyword, masterBrandOptions]);

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

  const changeEstimationMode = (nextMode: InventoryEstimationMode) => {
    setEstimationMode(nextMode);
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
        limit: masterResultLimit,
      });
      setMasterSearchResults(results);
      setMasterSearchMessage(results.length === 0 ? '' : `${results.length}件を表示しています。`);
    } finally {
      setMasterSearchLoading(false);
    }
  };

  const validate = () => {
    const nextErrors: FormErrors = {};
    const amountNumber = parseOptionalNumber(amount);
    const dailyUsageNumber = parseOptionalNumber(dailyUsage);
    const lastingDaysNumber = parseOptionalNumber(lastingDays);
    if (!name.trim()) nextErrors.name = '商品名は必須です。';
    if (estimationMode === 'usage') {
      if (!amountNumber || amountNumber <= 0) nextErrors.amount = '内容量は0より大きくしてください。';
      if (!dailyUsageNumber || dailyUsageNumber <= 0) {
        nextErrors.dailyUsage = '1日あたりの消費量は0より大きくしてください。';
      }
    }
    if (estimationMode === 'lasting_days' && (!lastingDaysNumber || lastingDaysNumber <= 0)) {
      nextErrors.lastingDays = '使い切る日数は0より大きくしてください。';
    }
    if (![amazon, rakuten, yahoo, other].every(isValidOptionalUrl)) {
      nextErrors.url = 'URLは http:// または https:// で始めてください。';
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const searchProducts = async () => {
    const keyword = productSearchKeyword.trim() || name.trim();
    setProductSearchError('');
    setProductSearchMessage('');
    setProductSearchResults([]);
    setProductSearchLoading(true);
    try {
      setProductSearchKeyword(keyword);
      if (!hasPurchaseLinkSearchApi()) {
        const url =
          purchaseLinkProvider === 'rakuten'
            ? `https://search.rakuten.co.jp/search/mall/${encodeURIComponent(keyword)}/`
            : `https://shopping.yahoo.co.jp/search?p=${encodeURIComponent(keyword)}`;
        await WebBrowser.openBrowserAsync(url);
        setProductSearchMessage(
          `${purchaseLinkProvider === 'rakuten' ? '楽天市場' : 'Yahooショッピング'}の検索ページを開きました。購入URLは必要に応じてURL欄へ貼り付けてください。`,
        );
        return;
      }
      const results = await searchRakutenItems(keyword, purchaseLinkProvider);
      setProductSearchResults(results);
      if (results.length === 0) {
        setProductSearchError('該当する商品が見つかりませんでした。');
      }
    } catch (error) {
      setProductSearchError(error instanceof Error ? error.message : '商品検索に失敗しました。');
    } finally {
      setProductSearchLoading(false);
    }
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
    const keyword = masterSearchKeyword.trim() || name.trim();
    const nextCategory = overrides.category ?? masterCategoryFilter;
    const nextBrand = overrides.brand ?? masterBrandFilter;
    setMasterSearchLoading(true);
    try {
      const results = await findProductsByKeywordAsync(overrides.keyword ?? keyword, {
        brand: nextBrand === 'all' ? undefined : nextBrand,
        category: nextCategory === 'all' ? undefined : nextCategory,
        limit: masterResultLimit,
      });
      setMasterSearchKeyword(overrides.keyword ?? keyword);
      setMasterSearchResults(results);
      setMasterSearchMessage(
        results.length === 0
          ? '商品マスタに該当する商品が見つかりませんでした。'
          : `${results.length}件を表示しています。`,
      );
    } finally {
      setMasterSearchLoading(false);
    }
  };

  const applyProductMaster = useCallback((product: ProductMaster) => {
    const nextCategory = productCategoryToInventoryCategory(product.category);
    const nextLinks = productPurchaseLinksToInventoryLinks(product);
    const nextImageUrl = getProductMasterImageUrl(product);
    const shouldCopyAmount = Boolean(product.amount !== undefined && product.unit && (product.janCode || product.gtin));
    setProductMasterId(product.id);
    setImageUrl(nextImageUrl);
    setName(product.name);
    setCategory(nextCategory);
    setAmount(shouldCopyAmount ? String(product.amount) : '');
    setEstimationMode('lasting_days');
    setUnit(shouldCopyAmount && product.unit ? productUnitToInventoryUnit(product.unit) : defaultUnitByCategory[nextCategory]);
    setAmazon(nextLinks.amazon ?? '');
    setRakuten(nextLinks.rakuten ?? '');
    setYahoo(nextLinks.yahoo ?? '');
    setOther(nextLinks.other ?? '');
    setProductSearchKeyword(product.name);
    setAddMethod(undefined);
    setMasterSearchResults([]);
    setMasterSearchMessage('');
    setShowMasterCategoryOptions(false);
    setShowMasterBrandOptions(false);
    setErrors((currentErrors) => ({ ...currentErrors, name: undefined, amount: undefined, url: undefined }));
    scrollToPurchaseDateField();
  }, [scrollToPurchaseDateField]);

  const applyYahooBarcodeResult = useCallback(
    (result: RakutenSearchResult, options: { showAlert: boolean } = { showAlert: true }) => {
      setProductMasterId(undefined);
      setImageUrl(undefined);
      setName(result.name);
      setYahoo(result.url);
      setProductSearchKeyword(result.name);
      setErrors((currentErrors) => ({ ...currentErrors, name: undefined, url: undefined }));
      scrollToNameField();
      if (options.showAlert) {
        Alert.alert('Yahoo検索結果を反映しました', '商品名とYahoo URLを入力欄に反映しました。');
      }
    },
    [scrollToNameField],
  );

  useEffect(() => {
    if (id) return;
    const normalizedBarcode = normalizeBarcodeParam(barcode);
    if (!normalizedBarcode) return;
    const scanKey = `${normalizedBarcode}:${typeof scannedAt === 'string' ? scannedAt : ''}`;
    if (lastAppliedBarcodeRef.current === scanKey) return;
    let isActive = true;
    lastAppliedBarcodeRef.current = scanKey;
    setAddMethod('barcode');
    setScannedBarcode(normalizedBarcode);
    setBarcodeSearchMessage('');
    setBarcodeSearchLoading(true);
    setBarcodeYahooResults([]);

    async function applyScannedBarcode() {
      const product = await findProductByJanCodeAsync(normalizedBarcode);
      if (!isActive) return;
      if (product) {
        applyProductMaster(product);
        setBarcodeSearchMessage(`JAN ${normalizedBarcode} に一致する商品をフォームへ反映しました。`);
        setBarcodeSearchLoading(false);
        return;
      }

      if (!hasPurchaseLinkSearchApi()) {
        setProductMasterId(undefined);
        setImageUrl(undefined);
        setMasterSearchKeyword(normalizedBarcode);
        setMasterSearchResults([]);
        setBarcodeSearchMessage(
          `JAN ${normalizedBarcode} は商品マスタに見つかりませんでした。Yahooショッピング検索の設定がないため、手入力で登録してください。`,
        );
        setBarcodeSearchLoading(false);
        return;
      }

      try {
        setBarcodeSearchMessage(`JAN ${normalizedBarcode} は商品マスタにないため、YahooショッピングをJANで検索しています。`);
        const yahooResults = await searchYahooItemsByJanCode(normalizedBarcode);
        if (!isActive) return;
        setBarcodeYahooResults(yahooResults);
        if (yahooResults.length > 0) {
          applyYahooBarcodeResult(yahooResults[0], { showAlert: false });
          setBarcodeSearchMessage(
            `Yahooショッピングで${yahooResults.length}件見つかりました。先頭候補をフォームへ反映しました。`,
          );
          return;
        }
        setProductMasterId(undefined);
        setImageUrl(undefined);
        setMasterSearchKeyword(normalizedBarcode);
        setMasterSearchResults([]);
        setBarcodeSearchMessage(
          `JAN ${normalizedBarcode} は商品マスタとYahooショッピングのどちらにも見つかりませんでした。手入力で登録してください。`,
        );
      } catch (error) {
        if (!isActive) return;
        setProductMasterId(undefined);
        setImageUrl(undefined);
        setMasterSearchKeyword(normalizedBarcode);
        setMasterSearchResults([]);
        setBarcodeSearchMessage(
          error instanceof Error
            ? `商品マスタに見つからず、Yahoo検索にも失敗しました: ${error.message}`
            : '商品マスタに見つからず、Yahoo検索にも失敗しました。',
        );
      } finally {
        if (isActive) setBarcodeSearchLoading(false);
      }
    }

    void applyScannedBarcode();
    return () => {
      isActive = false;
    };
  }, [applyProductMaster, applyYahooBarcodeResult, barcode, id, scannedAt]);

  const applyRakutenResult = (result: RakutenSearchResult, options: { includeName: boolean }) => {
    if (options.includeName) {
      setName(result.name);
    }
    if ((result.provider ?? purchaseLinkProvider) === 'yahoo') {
      setYahoo(result.url);
    } else {
      setRakuten(result.url);
    }
    setErrors((currentErrors) => ({
      ...currentErrors,
      name: options.includeName ? undefined : currentErrors.name,
      url: undefined,
    }));
    Alert.alert(
      '反映しました',
      options.includeName ? '商品名と購入URLを入力欄に反映しました。' : '購入URLを入力欄に反映しました。',
    );
  };

  const save = async () => {
    if (!validate() || !selectedCatId) return;
    const now = nowIso();
    const amountNumber = parseOptionalNumber(amount);
    const dailyUsageNumber = estimationMode === 'usage' ? parseOptionalNumber(dailyUsage) : undefined;
    const lastingDaysNumber = parseOptionalNumber(lastingDays);
    const estimatedEndDate = estimationMode === 'lasting_days' && lastingDaysNumber
      ? addDays(parseISO(purchaseDate), lastingDaysNumber).toISOString().slice(0, 10)
      : undefined;
    const purchaseLinks = {
      amazon: amazon.trim() || undefined,
      rakuten: rakuten.trim() || undefined,
      yahoo: yahoo.trim() || undefined,
      other: other.trim() || undefined,
    };
    await saveInventoryItem({
      id: current?.id ?? createId('item'),
      catId: selectedCatId,
      productMasterId,
      imageUrl,
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
      notifyBeforeDays,
      purchaseLinks,
      memo: memo.trim() || undefined,
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
    });
    if (!productMasterId && !current) {
      await saveUserProductSuggestion({
        id: createId('suggestion'),
        name: name.trim(),
        category,
        purchaseUrl: purchaseLinks.amazon ?? purchaseLinks.rakuten ?? purchaseLinks.yahoo ?? purchaseLinks.other,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      });
    }
    await updateSettings({ selectedCatId });
    const [items, settings] = await Promise.all([getInventoryItems(), getSettings()]);
    await scheduleInventoryNotifications(items, settings);
    router.back();
  };

  return (
    <ScrollView ref={scrollViewRef} contentContainerStyle={styles.container}>
      {cats.length > 1 ? (
        <>
          <FieldLabel label="対象の猫" requirement="required" />
          <View style={styles.wrapRow}>
            {cats.map((cat) => (
              <AppButton
                key={cat.id}
                title={cat.name}
                variant={cat.id === selectedCatId ? 'primary' : 'secondary'}
                onPress={() => setSelectedCatId(cat.id)}
              />
            ))}
          </View>
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
              title="バーコードで読み取る"
              variant={addMethod === 'barcode' ? 'primary' : 'secondary'}
              onPress={() => {
                setAddMethod('barcode');
                router.push('/barcode-scan' as Href);
              }}
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
              {masterSearchResults.map((product) => (
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
            </>
          ) : null}
          {addMethod === 'barcode' ? (
            <View style={styles.barcodeResultBox}>
              <Text style={styles.sectionTitle}>バーコード読み取り結果</Text>
              {scannedBarcode ? <Text style={styles.resultMeta}>JAN {scannedBarcode}</Text> : null}
              {barcodeSearchLoading ? <Text style={styles.resultSummary}>検索しています...</Text> : null}
              {barcodeSearchMessage ? <Text style={styles.resultSummary}>{barcodeSearchMessage}</Text> : null}
              {barcodeYahooResults.length > 0 ? (
                <>
                  <Text style={styles.affiliate}>Yahooショッピングの候補リンクにはアフィリエイトが含まれる場合があります。</Text>
                  {barcodeYahooResults.map((result) => (
                    <View key={result.id} style={styles.searchResult}>
                      <Text style={styles.resultName}>{result.name}</Text>
                      <Text style={styles.resultMeta}>
                        {[
                          'Yahooショッピング',
                          result.shopName,
                          result.price ? `${result.price.toLocaleString()}円` : undefined,
                        ]
                          .filter(Boolean)
                          .join(' ・ ')}
                      </Text>
                      <AppButton
                        title="反映する"
                        variant="secondary"
                        onPress={() => applyYahooBarcodeResult(result)}
                      />
                    </View>
                  ))}
                </>
              ) : null}
              <View style={styles.resultActions}>
                <AppButton
                  title="もう一度読み取る"
                  variant="secondary"
                  onPress={() => router.push('/barcode-scan' as Href)}
                  style={styles.resultAction}
                />
                <AppButton
                  title="手入力で続ける"
                  variant="secondary"
                  onPress={() => setAddMethod('manual')}
                  style={styles.resultAction}
                />
              </View>
            </View>
          ) : null}
        </AppCard>
      ) : null}

      <View onLayout={(event) => {
        nameFieldYRef.current = event.nativeEvent.layout.y;
      }}>
        <AppTextInput label="商品名" value={name} onChangeText={setName} error={errors.name} requirement="required" />
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

      <View onLayout={(event) => {
        purchaseDateFieldYRef.current = event.nativeEvent.layout.y;
      }}>
        <DatePickerField
          label="購入日"
          value={purchaseDate}
          onChange={setPurchaseDate}
          requirement="required"
          openSignal={purchaseDatePickerOpenSignal}
        />
      </View>

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
      </AppCard>

      <FieldLabel label="通知タイミング" requirement="optional" />
      <View style={styles.wrapRow}>
        {[7, 3, 1].map((day) => (
          <AppButton
            key={day}
            title={`残り${day}日`}
            variant={notifyBeforeDays.includes(day) ? 'primary' : 'secondary'}
            onPress={() => toggleNotify(day)}
          />
        ))}
      </View>

      <AppTextInput label="Amazon URL" value={amazon} onChangeText={setAmazon} error={errors.url} requirement="optional" />
      <AppTextInput label="楽天 URL" value={rakuten} onChangeText={setRakuten} requirement="optional" />
      <AppTextInput label="Yahoo URL" value={yahoo} onChangeText={setYahoo} requirement="optional" />
      <AppTextInput label="その他URL" value={other} onChangeText={setOther} requirement="optional" />

      <AppCard style={styles.searchCard}>
        <View style={styles.collapsibleHeader}>
          <View style={styles.collapsibleTitleWrap}>
            <Text style={styles.sectionTitle}>購入リンクを探す</Text>
            <Text style={styles.affiliate}>検索結果のリンクにはアフィリエイトが含まれる場合があります。</Text>
          </View>
          <AppButton
            title={showPurchaseLinkSearch ? '閉じる' : '開く'}
            variant="secondary"
            onPress={() => setShowPurchaseLinkSearch((current) => !current)}
          />
        </View>
        {showPurchaseLinkSearch ? (
          <>
            <FieldLabel label="検索先" requirement="required" />
            <View style={styles.wrapRow}>
              <AppButton
                title="楽天市場"
                variant={purchaseLinkProvider === 'rakuten' ? 'primary' : 'secondary'}
                onPress={() => {
                  setPurchaseLinkProvider('rakuten');
                  setProductSearchResults([]);
                  setProductSearchMessage('');
                  setProductSearchError('');
                }}
              />
              <AppButton
                title="Yahooショッピング"
                variant={purchaseLinkProvider === 'yahoo' ? 'primary' : 'secondary'}
                onPress={() => {
                  setPurchaseLinkProvider('yahoo');
                  setProductSearchResults([]);
                  setProductSearchMessage('');
                  setProductSearchError('');
                }}
              />
            </View>
            <AppTextInput
              label={`${purchaseLinkProvider === 'rakuten' ? '楽天市場' : 'Yahooショッピング'}で検索`}
              value={productSearchKeyword}
              onChangeText={setProductSearchKeyword}
              placeholder={name || '例：キャットフード'}
            />
            <AppButton
              title={productSearchLoading ? '検索中...' : `${purchaseLinkProvider === 'rakuten' ? '楽天市場' : 'Yahooショッピング'}で探す`}
              variant="secondary"
              disabled={productSearchLoading}
              onPress={() => void searchProducts()}
            />
            {productSearchMessage ? <Text style={styles.resultSummary}>{productSearchMessage}</Text> : null}
            {productSearchError ? <Text style={styles.errorText}>{productSearchError}</Text> : null}
            {productSearchResults.map((result) => (
              <View key={result.id} style={styles.searchResult}>
                <Text style={styles.resultName}>{result.name}</Text>
                <Text style={styles.resultMeta}>
                  {[
                    result.provider === 'yahoo' ? 'Yahooショッピング' : '楽天市場',
                    result.shopName,
                    result.price ? `${result.price.toLocaleString()}円` : undefined,
                  ]
                    .filter(Boolean)
                    .join(' ・ ')}
                </Text>
                <View style={styles.resultActions}>
                  <AppButton
                    title="URLだけ反映"
                    variant="secondary"
                    onPress={() => applyRakutenResult(result, { includeName: false })}
                    style={styles.resultAction}
                  />
                  <AppButton
                    title="商品名も反映"
                    variant="secondary"
                    onPress={() => applyRakutenResult(result, { includeName: true })}
                    style={styles.resultAction}
                  />
                </View>
              </View>
            ))}
          </>
        ) : null}
      </AppCard>

      <AppTextInput label="メモ" value={memo} onChangeText={setMemo} multiline style={styles.memo} requirement="optional" />

      <AppButton title="保存する" onPress={() => void save()} />
      <AppButton
        title="キャンセル"
        variant="secondary"
        onPress={() => {
          Alert.alert('入力を破棄しますか？', undefined, [
            { text: '戻る', style: 'cancel' },
            { text: '破棄する', style: 'destructive', onPress: () => router.back() },
          ]);
        }}
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

function normalizeBarcodeParam(value: string | string[] | undefined): string {
  const rawValue = Array.isArray(value) ? value[0] : value;
  return rawValue?.replace(/\D/g, '') ?? '';
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
  collapsibleHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  collapsibleTitleWrap: {
    flex: 1,
    gap: 4,
  },
  affiliate: {
    color: colors.subText,
    fontSize: 12,
    lineHeight: 18,
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
  barcodeResultBox: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    gap: 10,
    paddingTop: 12,
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
