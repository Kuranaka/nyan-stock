import { useCallback, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { AppButton } from '@/components/AppButton';
import { AppTextInput } from '@/components/AppTextInput';
import { categories, defaultUnitByCategory, units } from '@/constants/categories';
import { colors } from '@/constants/colors';
import { getPrimaryCat, saveCat } from '@/features/cats/catStorage';
import { Cat } from '@/features/cats/catTypes';
import {
  getInventoryItem,
  getInventoryItems,
  saveInventoryItem,
} from '@/features/inventory/inventoryStorage';
import { InventoryCategory, InventoryItem, InventoryUnit } from '@/features/inventory/inventoryTypes';
import { scheduleInventoryNotifications } from '@/features/notifications/notificationService';
import { getSettings } from '@/features/settings/settingsStorage';
import { nowIso, todayIso } from '@/utils/date';
import { createId, isValidOptionalUrl, parseOptionalNumber } from '@/utils/validation';

type FormErrors = Partial<Record<'name' | 'amount' | 'dailyUsage' | 'url', string>>;

export default function InventoryFormScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [cat, setCat] = useState<Cat | undefined>();
  const [current, setCurrent] = useState<InventoryItem | undefined>();
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

  useFocusEffect(
    useCallback(() => {
      async function load() {
        let nextCat = await getPrimaryCat();
        if (!nextCat) {
          const now = nowIso();
          nextCat = {
            id: createId('cat'),
            name: 'うちの猫',
            gender: 'unknown',
            createdAt: now,
            updatedAt: now,
          };
          await saveCat(nextCat);
        }
        setCat(nextCat);
        if (!id) return;
        const item = await getInventoryItem(id);
        if (!item) return;
        setCurrent(item);
        setName(item.name);
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

  const save = async () => {
    if (!validate() || !cat) return;
    const now = nowIso();
    const dailyUsageNumber = parseOptionalNumber(dailyUsage) ?? calculatedDailyUsage;
    await saveInventoryItem({
      id: current?.id ?? createId('item'),
      catId: cat.id,
      name: name.trim(),
      category,
      amount: Number(amount),
      unit,
      dailyUsage: dailyUsageNumber,
      purchaseDate,
      openedDate: openedDate.trim() || undefined,
      notifyBeforeDays,
      purchaseLinks: {
        amazon: amazon.trim() || undefined,
        rakuten: rakuten.trim() || undefined,
        yahoo: yahoo.trim() || undefined,
        other: other.trim() || undefined,
      },
      memo: memo.trim() || undefined,
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
    });
    const [items, settings] = await Promise.all([getInventoryItems(), getSettings()]);
    await scheduleInventoryNotifications(items, settings);
    router.back();
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <AppTextInput label="商品名" value={name} onChangeText={setName} error={errors.name} />

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
