import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { AppButton } from '@/components/AppButton';
import { AppCard } from '@/components/AppCard';
import { AppTextInput } from '@/components/AppTextInput';
import { colors } from '@/constants/colors';
import { deleteCat, getCat, getCats, saveCat } from '@/features/cats/catStorage';
import { Cat, CatGender } from '@/features/cats/catTypes';
import { deleteInventoryItemsForCat, getInventoryItems } from '@/features/inventory/inventoryStorage';
import { scheduleInventoryNotifications } from '@/features/notifications/notificationService';
import { getSettings, updateSettings } from '@/features/settings/settingsStorage';
import { nowIso } from '@/utils/date';
import { createId, parseOptionalNumber } from '@/utils/validation';

const genderOptions: { label: string; value: CatGender }[] = [
  { label: '男の子', value: 'male' },
  { label: '女の子', value: 'female' },
  { label: '不明', value: 'unknown' },
];

export default function CatProfileScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [cats, setCats] = useState<Cat[]>([]);
  const [current, setCurrent] = useState<Cat | undefined>();
  const [name, setName] = useState('');
  const [birthday, setBirthday] = useState('');
  const [age, setAge] = useState('');
  const [weight, setWeight] = useState('');
  const [gender, setGender] = useState<CatGender>('unknown');
  const [memo, setMemo] = useState('');

  const resetForm = useCallback(() => {
    setCurrent(undefined);
    setName('');
    setBirthday('');
    setAge('');
    setWeight('');
    setGender('unknown');
    setMemo('');
  }, []);

  const fillForm = useCallback((cat: Cat) => {
    setCurrent(cat);
    setName(cat.name);
    setBirthday(cat.birthday ?? '');
    setAge(cat.age?.toString() ?? '');
    setWeight(cat.weight?.toString() ?? '');
    setGender(cat.gender);
    setMemo(cat.memo ?? '');
  }, []);

  const load = useCallback(async () => {
    const nextCats = await getCats();
    setCats(nextCats);
    if (id) {
      const cat = await getCat(id);
      if (cat) {
        fillForm(cat);
        return;
      }
    }
    if (current && nextCats.some((cat) => cat.id === current.id)) {
      return;
    }
    if (nextCats[0]) {
      fillForm(nextCats[0]);
      return;
    }
    resetForm();
  }, [current, fillForm, id, resetForm]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const save = async () => {
    if (!name.trim()) {
      Alert.alert('入力を確認してください', '猫の名前は必須です。');
      return;
    }
    const now = nowIso();
    const catId = current?.id ?? createId('cat');
    await saveCat({
      id: catId,
      name: name.trim(),
      birthday: birthday.trim() || undefined,
      age: parseOptionalNumber(age),
      weight: parseOptionalNumber(weight),
      gender,
      memo: memo.trim() || undefined,
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
    });
    await updateSettings({ selectedCatId: catId });
    await load();
    Alert.alert('保存しました', `${name.trim()}のプロフィールを保存しました。`);
  };

  const startNew = () => {
    resetForm();
  };

  const remove = () => {
    if (!current) return;
    Alert.alert(
      '猫プロフィールを削除しますか？',
      `${current.name}のプロフィール、在庫、購入履歴を削除します。`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除する',
          style: 'destructive',
          onPress: async () => {
            const deletedCatId = current.id;
            await deleteInventoryItemsForCat(deletedCatId);
            await deleteCat(deletedCatId);
            const [nextCats, items, settings] = await Promise.all([getCats(), getInventoryItems(), getSettings()]);
            const nextSelectedCatId =
              settings.selectedCatId === deletedCatId ? nextCats[0]?.id : settings.selectedCatId;
            await updateSettings({ selectedCatId: nextSelectedCatId });
            await scheduleInventoryNotifications(items, { ...settings, selectedCatId: nextSelectedCatId });
            setCats(nextCats);
            if (nextCats[0]) {
              fillForm(nextCats[0]);
            } else {
              resetForm();
            }
          },
        },
      ],
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.lead}>猫ごとにプロフィールと在庫を分けて記録できます。</Text>

      {cats.length > 0 ? (
        <AppCard style={styles.card}>
          <Text style={styles.sectionTitle}>登録中の猫</Text>
          <View style={styles.catList}>
            {cats.map((cat) => (
              <AppButton
                key={cat.id}
                title={cat.name}
                variant={cat.id === current?.id ? 'primary' : 'secondary'}
                onPress={() => fillForm(cat)}
                style={styles.catButton}
              />
            ))}
          </View>
          <AppButton title="新しく追加" variant="secondary" onPress={startNew} />
        </AppCard>
      ) : null}

      <Text style={styles.sectionTitle}>{current ? 'プロフィール編集' : 'プロフィール追加'}</Text>
      <AppTextInput label="猫の名前" value={name} onChangeText={setName} placeholder="例：ミルク" />
      <AppTextInput
        label="誕生日"
        value={birthday}
        onChangeText={setBirthday}
        placeholder="例：2022-04-01"
      />
      <AppTextInput
        label="年齢"
        value={age}
        onChangeText={setAge}
        keyboardType="numeric"
        placeholder="例：3"
      />
      <AppTextInput
        label="体重"
        value={weight}
        onChangeText={setWeight}
        keyboardType="decimal-pad"
        placeholder="例：4.2"
      />
      <Text style={styles.label}>性別</Text>
      <View style={styles.segment}>
        {genderOptions.map((option) => (
          <AppButton
            key={option.value}
            title={option.label}
            variant={gender === option.value ? 'primary' : 'secondary'}
            onPress={() => setGender(option.value)}
            style={styles.segmentButton}
          />
        ))}
      </View>
      <AppTextInput
        label="メモ"
        value={memo}
        onChangeText={setMemo}
        multiline
        placeholder="通院時のメモなど"
        style={styles.memo}
      />
      <AppButton title="保存する" onPress={() => void save()} />
      {current ? <AppButton title="この猫を削除" variant="danger" onPress={remove} /> : null}
      <AppButton title="閉じる" variant="secondary" onPress={() => router.back()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
    padding: 18,
    paddingBottom: 36,
  },
  card: {
    gap: 12,
  },
  lead: {
    color: colors.subText,
    fontSize: 14,
    lineHeight: 21,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  catList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  catButton: {
    minWidth: 96,
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  segment: {
    flexDirection: 'row',
    gap: 8,
  },
  segmentButton: {
    flex: 1,
  },
  memo: {
    minHeight: 90,
    textAlignVertical: 'top',
    paddingTop: 12,
  },
});
