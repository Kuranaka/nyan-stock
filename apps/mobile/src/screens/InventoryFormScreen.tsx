import { useCallback, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
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
  findProductsByKeyword,
  productCategoryLabels,
  productCategoryToInventoryCategory,
  productPurchaseLinksToInventoryLinks,
  productUnitToInventoryUnit,
} from '@/features/products/productMaster';
import { ProductMaster } from '@/features/products/productTypes';
import { saveUserProductSuggestion } from '@/features/products/userProductSuggestionStorage';
import { getSettings, updateSettings } from '@/features/settings/settingsStorage';
import { nowIso, todayIso } from '@/utils/date';
import { createId, isValidOptionalUrl, parseOptionalNumber } from '@/utils/validation';

type FormErrors = Partial<Record<'name' | 'amount' | 'dailyUsage' | 'url', string>>;
type AddMethod = 'master' | 'barcode' | 'manual';

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
  const [notifyBeforeDays, setNotifyBeforeDays] = useState<number[]>([7, 3, 1]);
  const [amazon, setAmazon] = useState('');
  const [rakuten, setRakuten] = useState('');
  const [yahoo, setYahoo] = useState('');
  const [other, setOther] = useState('');
  const [memo, setMemo] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [masterSearchKeyword, setMasterSearchKeyword] = useState('');
  const [masterSearchResults, setMasterSearchResults] = useState<ProductMaster[]>([]);
  const [masterSearchMessage, setMasterSearchMessage] = useState('');
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
    const dailyUsageNumber = parseOptionalNumber(dailyUsage) ?? calculatedDailyUsage;
    if (!name.trim()) nextErrors.name = '商品名は必須です。';
    if (!amountNumber || amountNumber <= 0) nextErrors.amount = '内容量は0より大きくしてください。';
    if (dailyUsageNumber !== undefined && dailyUsageNumber <= 0) {
      nextErrors.dailyUsage = '1日あたりの消費量は0より大きくしてください。';
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

  const searchProductMasters = () => {
    const keyword = masterSearchKeyword.trim() || name.trim();
    const results = findProductsByKeyword(keyword);
    setMasterSearchKeyword(keyword);
    setMasterSearchResults(results);
    setMasterSearchMessage(results.length === 0 ? '商品マスタに該当する商品が見つかりませんでした。' : '');
  };

  const applyProductMaster = (product: ProductMaster) => {
    const nextCategory = productCategoryToInventoryCategory(product.category);
    const nextLinks = productPurchaseLinksToInventoryLinks(product);
    setProductMasterId(product.id);
    setName(product.name);
    setCategory(nextCategory);
    setAmount(product.amount !== undefined ? String(product.amount) : '');
    setUnit(product.unit ? productUnitToInventoryUnit(product.unit) : defaultUnitByCategory[nextCategory]);
    setAmazon(nextLinks.amazon ?? '');
    setRakuten(nextLinks.rakuten ?? '');
    setYahoo(nextLinks.yahoo ?? '');
    setOther(nextLinks.other ?? '');
    setProductSearchKeyword(product.name);
    setErrors((currentErrors) => ({ ...currentErrors, name: undefined, amount: undefined, url: undefined }));
    Alert.alert('商品マスタから反映しました', '内容は保存前に自由に編集できます。');
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
    const dailyUsageNumber = parseOptionalNumber(dailyUsage) ?? calculatedDailyUsage;
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
      amount: Number(amount),
      unit,
      dailyUsage: dailyUsageNumber,
      purchaseDate,
      openedDate: openedDate.trim() || undefined,
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
          <Text style={styles.label}>対象の猫</Text>
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
              title="商品名で検索"
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
                label="商品マスタを検索"
                value={masterSearchKeyword}
                onChangeText={setMasterSearchKeyword}
                placeholder="例：ドライフード チキン"
              />
              <AppButton title="商品名で検索" variant="secondary" onPress={searchProductMasters} />
              {masterSearchMessage ? <Text style={styles.errorText}>{masterSearchMessage}</Text> : null}
              {masterSearchResults.map((product) => (
                <View key={product.id} style={styles.searchResult}>
                  <Text style={styles.resultName}>{product.name}</Text>
                  <Text style={styles.resultMeta}>
                    {[
                      product.brand,
                      productCategoryLabels[product.category],
                      product.amount !== undefined && product.unit ? `${product.amount}${product.unit}` : undefined,
                    ]
                      .filter(Boolean)
                      .join(' ・ ')}
                  </Text>
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

      <AppTextInput label="商品名" value={name} onChangeText={setName} error={errors.name} />

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

      <Text style={styles.label}>カテゴリ</Text>
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
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          error={errors.amount}
        />
        <View style={styles.unitBox}>
          <Text style={styles.label}>単位</Text>
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

      <AppTextInput label="購入日" value={purchaseDate} onChangeText={setPurchaseDate} />
      <AppTextInput label="開封日" value={openedDate} onChangeText={setOpenedDate} />
      <AppTextInput
        label="1日あたりの消費量"
        value={dailyUsage}
        onChangeText={setDailyUsage}
        keyboardType="decimal-pad"
        error={errors.dailyUsage}
      />
      <AppTextInput
        label="簡単入力：この商品は何日くらい持ちますか？"
        value={lastingDays}
        onChangeText={setLastingDays}
        keyboardType="numeric"
      />
      {calculatedDailyUsage ? (
        <Text style={styles.hint}>簡単入力から {calculatedDailyUsage}{unit}/日 として保存できます。</Text>
      ) : null}

      <Text style={styles.label}>通知タイミング</Text>
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

      <AppTextInput label="Amazon URL" value={amazon} onChangeText={setAmazon} error={errors.url} />
      <AppTextInput label="楽天 URL" value={rakuten} onChangeText={setRakuten} />
      <AppTextInput label="Yahoo URL" value={yahoo} onChangeText={setYahoo} />
      <AppTextInput label="その他URL" value={other} onChangeText={setOther} />
      <AppTextInput label="メモ" value={memo} onChangeText={setMemo} multiline style={styles.memo} />

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
  searchResult: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    gap: 8,
    paddingTop: 12,
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
