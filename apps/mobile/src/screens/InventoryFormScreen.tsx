import { useCallback, useMemo, useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { addDays, parseISO } from 'date-fns';
import { Href } from 'expo-router';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { AppButton } from '@/components/AppButton';
import { AppCard } from '@/components/AppCard';
import { AppTextInput } from '@/components/AppTextInput';
import { categories, defaultUnitByCategory, units } from '@/constants/categories';
import { colors } from '@/constants/colors';
import { getCats, saveCat } from '@/features/cats/catStorage';
import { Cat } from '@/features/cats/catTypes';
import { RakutenSearchResult, searchRakutenItems } from '@/features/ec/rakutenSearch';
import {
  getInventoryItem,
  getInventoryItems,
  saveInventoryItem,
} from '@/features/inventory/inventoryStorage';
import { InventoryCategory, InventoryItem, InventoryUnit } from '@/features/inventory/inventoryTypes';
import { scheduleInventoryNotifications } from '@/features/notifications/notificationService';
import {
  findProductsByKeywordAsync,
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
type AddMethod = 'master' | 'barcode' | 'manual';
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
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [cats, setCats] = useState<Cat[]>([]);
  const [selectedCatId, setSelectedCatId] = useState<string | undefined>();
  const [current, setCurrent] = useState<InventoryItem | undefined>();
  const [addMethod, setAddMethod] = useState<AddMethod>('master');
  const [productMasterId, setProductMasterId] = useState<string | undefined>();
  const [name, setName] = useState('');
  const [category, setCategory] = useState<InventoryCategory>('dry_food');
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState<InventoryUnit>('g');
  const [purchaseDate, setPurchaseDate] = useState(todayIso());
  const [openedDate, setOpenedDate] = useState('');
  const [dailyUsage, setDailyUsage] = useState('');
  const [lastingDays, setLastingDays] = useState('');
  const [usePurchaseFrequencyEstimate, setUsePurchaseFrequencyEstimate] = useState(false);
  const [notifyBeforeDays, setNotifyBeforeDays] = useState<number[]>([7, 3, 1]);
  const [amazon, setAmazon] = useState('');
  const [rakuten, setRakuten] = useState('');
  const [yahoo, setYahoo] = useState('');
  const [other, setOther] = useState('');
  const [memo, setMemo] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [masterSearchKeyword, setMasterSearchKeyword] = useState('');
  const [masterCategoryFilter, setMasterCategoryFilter] = useState<ProductCategoryFilter>('all');
  const [masterBrandFilter, setMasterBrandFilter] = useState<string>('all');
  const [masterBrandOptions, setMasterBrandOptions] = useState<string[]>([]);
  const [masterBrandKeyword, setMasterBrandKeyword] = useState('');
  const [masterBrandExpanded, setMasterBrandExpanded] = useState(false);
  const [masterSearchResults, setMasterSearchResults] = useState<ProductMaster[]>([]);
  const [masterSearchMessage, setMasterSearchMessage] = useState('');
  const [masterSearchLoading, setMasterSearchLoading] = useState(false);
  const [productSearchKeyword, setProductSearchKeyword] = useState('');
  const [productSearchResults, setProductSearchResults] = useState<RakutenSearchResult[]>([]);
  const [productSearchLoading, setProductSearchLoading] = useState(false);
  const [productSearchError, setProductSearchError] = useState('');

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
          const [brands, products] = await Promise.all([
            getProductMasterBrands(),
            findProductsByKeywordAsync('', { limit: masterResultLimit }),
          ]);
          setMasterBrandOptions(brands);
          setMasterSearchResults(products);
          setMasterSearchMessage(products.length === 0 ? '' : `${products.length}件を表示しています。`);
          return;
        }
        const item = await getInventoryItem(id);
        if (!item) return;
        setCurrent(item);
        setAddMethod('manual');
        setProductMasterId(item.productMasterId);
        setSelectedCatId(item.catId);
        setName(item.name);
        setMasterSearchKeyword(item.name);
        setProductSearchKeyword(item.name);
        setCategory(item.category);
        setAmount(String(item.amount));
        setUnit(item.unit);
        setPurchaseDate(item.purchaseDate);
        setOpenedDate(item.openedDate ?? '');
        setDailyUsage(item.dailyUsage?.toString() ?? '');
        setUsePurchaseFrequencyEstimate(item.estimationMode === 'purchase_frequency');
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

  const calculatedDailyUsage = useMemo(() => {
    const amountNumber = parseOptionalNumber(amount);
    const daysNumber = parseOptionalNumber(lastingDays);
    if (!amountNumber || !daysNumber || daysNumber <= 0) return undefined;
    return Math.round((amountNumber / daysNumber) * 100) / 100;
  }, [amount, lastingDays]);

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

  const validate = () => {
    const nextErrors: FormErrors = {};
    const amountNumber = parseOptionalNumber(amount);
    const dailyUsageNumber = parseOptionalNumber(dailyUsage);
    const lastingDaysNumber = parseOptionalNumber(lastingDays);
    const hasUsagePair = Boolean(amountNumber && amountNumber > 0 && dailyUsageNumber && dailyUsageNumber > 0);
    const hasLastingDays = Boolean(lastingDaysNumber && lastingDaysNumber > 0);
    const hasPurchaseFrequencyEstimate = usePurchaseFrequencyEstimate;
    if (!name.trim()) nextErrors.name = '商品名は必須です。';
    if (dailyUsageNumber !== undefined && dailyUsageNumber <= 0) {
      nextErrors.dailyUsage = '1日あたりの消費量は0より大きくしてください。';
    }
    if (amountNumber !== undefined && amountNumber <= 0) {
      nextErrors.amount = '内容量は0より大きくしてください。';
    }
    if (lastingDaysNumber !== undefined && lastingDaysNumber <= 0) {
      nextErrors.lastingDays = '買い替えまでの日数は0より大きくしてください。';
    }
    if (!hasUsagePair && !hasLastingDays && !hasPurchaseFrequencyEstimate) {
      nextErrors.amount = '内容量と1日あたりの消費量、買い替えまでの日数、または購入頻度から自動計算を選んでください。';
      nextErrors.dailyUsage = '内容量とセットで入力するか、別の推定方法を選んでください。';
      nextErrors.lastingDays = 'この日数だけでも登録できます。一旦保留にする場合は購入頻度から自動計算を選んでください。';
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
    setProductSearchResults([]);
    setProductSearchLoading(true);
    try {
      const settings = await getSettings();
      const results = await searchRakutenItems(keyword, settings);
      setProductSearchKeyword(keyword);
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
    setMasterBrandFilter('all');
    setMasterBrandKeyword('');
    setMasterBrandExpanded(false);
    await refreshProductMasterBrands(nextCategory);
    await searchProductMasters({ category: nextCategory, brand: 'all' });
  };

  const changeMasterBrandFilter = async (nextBrand: string) => {
    setMasterBrandFilter(nextBrand);
    setMasterBrandKeyword('');
    setMasterBrandExpanded(false);
    await searchProductMasters({ brand: nextBrand });
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

  const applyProductMaster = (product: ProductMaster) => {
    const nextCategory = productCategoryToInventoryCategory(product.category);
    const nextLinks = productPurchaseLinksToInventoryLinks(product);
    const shouldCopyAmount = Boolean(product.amount !== undefined && product.unit && (product.janCode || product.gtin));
    setProductMasterId(product.id);
    setName(product.name);
    setCategory(nextCategory);
    setAmount(shouldCopyAmount ? String(product.amount) : '');
    setUsePurchaseFrequencyEstimate(false);
    setUnit(shouldCopyAmount && product.unit ? productUnitToInventoryUnit(product.unit) : defaultUnitByCategory[nextCategory]);
    setAmazon(nextLinks.amazon ?? '');
    setRakuten(nextLinks.rakuten ?? '');
    setYahoo(nextLinks.yahoo ?? '');
    setOther(nextLinks.other ?? '');
    setProductSearchKeyword(product.name);
    setErrors((currentErrors) => ({ ...currentErrors, name: undefined, amount: undefined, url: undefined }));
    Alert.alert(
      '商品マスタから反映しました',
      shouldCopyAmount ? '内容は保存前に自由に編集できます。' : '内容量は今回登録する商品の容量を入力してください。',
    );
  };

  const applyRakutenResult = (result: RakutenSearchResult) => {
    setName(result.name);
    setRakuten(result.url);
    setErrors((currentErrors) => ({ ...currentErrors, url: undefined }));
    Alert.alert('反映しました', '商品名と楽天URLを入力欄に反映しました。');
  };

  const save = async () => {
    if (!validate() || !selectedCatId) return;
    const now = nowIso();
    const amountNumber = parseOptionalNumber(amount);
    const dailyUsageNumber = usePurchaseFrequencyEstimate
      ? undefined
      : parseOptionalNumber(dailyUsage) ?? calculatedDailyUsage;
    const lastingDaysNumber = parseOptionalNumber(lastingDays);
    const estimationMode = usePurchaseFrequencyEstimate
      ? 'purchase_frequency'
      : dailyUsageNumber && amountNumber
      ? 'usage'
      : lastingDaysNumber
        ? 'lasting_days'
        : 'purchase_frequency';
    const estimatedEndDate = !usePurchaseFrequencyEstimate && lastingDaysNumber
      ? addDays(parseISO(openedDate.trim() || purchaseDate), lastingDaysNumber).toISOString().slice(0, 10)
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
      name: name.trim(),
      category,
      amount: amountNumber ?? 0,
      unit,
      dailyUsage: dailyUsageNumber,
      purchaseDate,
      openedDate: openedDate.trim() || undefined,
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
    <ScrollView contentContainerStyle={styles.container}>
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
              title="よくある商品から選ぶ"
              variant={addMethod === 'master' ? 'primary' : 'secondary'}
              onPress={() => setAddMethod('master')}
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
              <Text style={styles.label}>カテゴリを選ぶ</Text>
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
              {masterBrandOptions.length > 0 ? (
                <>
                  <Text style={styles.label}>ブランドで絞り込み</Text>
                  <View style={styles.filterSummaryRow}>
                    <AppButton
                      title={masterBrandFilter === 'all' ? 'ブランドすべて' : masterBrandFilter}
                      variant="primary"
                      onPress={() => void changeMasterBrandFilter('all')}
                    />
                    {masterBrandFilter !== 'all' ? (
                      <AppButton
                        title="解除"
                        variant="secondary"
                        onPress={() => void changeMasterBrandFilter('all')}
                      />
                    ) : null}
                  </View>
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
              <AppButton
                title={masterSearchLoading ? '検索中...' : '商品名で検索'}
                variant="secondary"
                disabled={masterSearchLoading}
                onPress={() => void searchProductMasters()}
              />
              {masterSearchMessage ? <Text style={styles.resultSummary}>{masterSearchMessage}</Text> : null}
              {masterSearchResults.map((product) => (
                <View key={product.id} style={styles.searchResult}>
                  {(() => {
                    const imageUrl = getProductImageUrl(product);
                    return (
                      <View style={styles.productResultBody}>
                        {imageUrl ? (
                          <Image source={{ uri: imageUrl }} style={styles.productThumbnail} resizeMode="contain" />
                        ) : null}
                        <View style={styles.productResultText}>
                          <Text style={styles.resultName}>{product.name}</Text>
                          <Text style={styles.resultMeta}>
                            {[
                              product.brand,
                              productCategoryLabels[product.category],
                              product.janCode ? `JAN ${product.janCode}` : undefined,
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
        </AppCard>
      ) : null}

      <AppTextInput label="商品名" value={name} onChangeText={setName} error={errors.name} requirement="required" />

      <AppCard style={styles.searchCard}>
        <Text style={styles.sectionTitle}>EC商品検索</Text>
        <Text style={styles.affiliate}>検索結果のリンクにはアフィリエイトが含まれる場合があります。</Text>
        <AppTextInput
          label="楽天市場で検索"
          value={productSearchKeyword}
          onChangeText={setProductSearchKeyword}
          placeholder={name || '例：キャットフード'}
        />
        <AppButton
          title={productSearchLoading ? '検索中...' : '商品を検索'}
          variant="secondary"
          disabled={productSearchLoading}
          onPress={() => void searchProducts()}
        />
        {productSearchError ? <Text style={styles.errorText}>{productSearchError}</Text> : null}
        {productSearchResults.map((result) => (
          <View key={result.id} style={styles.searchResult}>
            <Text style={styles.resultName}>{result.name}</Text>
            <Text style={styles.resultMeta}>
              {[result.shopName, result.price ? `${result.price.toLocaleString()}円` : undefined]
                .filter(Boolean)
                .join(' ・ ')}
            </Text>
            <AppButton title="この商品を反映" variant="secondary" onPress={() => applyRakutenResult(result)} />
          </View>
        ))}
      </AppCard>

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

      <View style={styles.twoColumns}>
        <AppTextInput
          label="内容量"
          value={amount}
          onChangeText={(value) => {
            setAmount(value);
            if (value.trim()) setUsePurchaseFrequencyEstimate(false);
          }}
          keyboardType="decimal-pad"
          error={errors.amount}
          requirement="conditional"
        />
        <View style={styles.unitBox}>
          <FieldLabel label="単位" requirement="required" />
          <View style={styles.wrapRow}>
            {units.map((option) => (
              <AppButton
                key={option}
                title={option}
                variant={unit === option ? 'primary' : 'secondary'}
                onPress={() => setUnit(option)}
              />
            ))}
          </View>
        </View>
      </View>

      <AppTextInput label="購入日" value={purchaseDate} onChangeText={setPurchaseDate} requirement="required" />
      <AppTextInput label="開封日" value={openedDate} onChangeText={setOpenedDate} requirement="optional" />
      <AppTextInput
        label="1日あたりの消費量"
        value={dailyUsage}
        onChangeText={(value) => {
          setDailyUsage(value);
          if (value.trim()) setUsePurchaseFrequencyEstimate(false);
        }}
        keyboardType="decimal-pad"
        error={errors.dailyUsage}
        requirement="conditional"
      />
      <AppTextInput
        label="買い替えまでの日数"
        value={lastingDays}
        onChangeText={(value) => {
          setLastingDays(value);
          if (value.trim()) setUsePurchaseFrequencyEstimate(false);
        }}
        keyboardType="numeric"
        error={errors.lastingDays}
        requirement="conditional"
      />
      <AppButton
        title={usePurchaseFrequencyEstimate ? '購入頻度から自動計算：選択中' : '一旦保留して購入頻度から自動計算'}
        variant={usePurchaseFrequencyEstimate ? 'primary' : 'secondary'}
        onPress={() => {
          setUsePurchaseFrequencyEstimate((current) => !current);
          setErrors((currentErrors) => ({
            ...currentErrors,
            amount: undefined,
            dailyUsage: undefined,
            lastingDays: undefined,
          }));
        }}
      />
      <Text style={styles.hint}>
        内容量と1日あたりの消費量、買い替えまでの日数、または購入頻度から自動計算のどれかを選んでください。
      </Text>
      {usePurchaseFrequencyEstimate ? (
        <Text style={styles.hint}>購入履歴が増えるまでは残り日数は未計算として表示します。</Text>
      ) : null}
      {calculatedDailyUsage ? (
        <Text style={styles.hint}>簡単入力から {calculatedDailyUsage}{unit}/日 として保存できます。</Text>
      ) : null}

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

function getProductImageUrl(product: ProductMaster): string | undefined {
  const candidates = [product.imageUrl, ...(product.packageImageUrls ?? [])];
  return candidates.find((url) => url && /^https?:\/\//i.test(url));
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
  searchResult: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    gap: 8,
    paddingTop: 12,
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
  filterSummaryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
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
