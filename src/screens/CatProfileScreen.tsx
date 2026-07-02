import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { AppButton } from '@/components/AppButton';
import { AppTextInput } from '@/components/AppTextInput';
import { colors } from '@/constants/colors';
import { getPrimaryCat, saveCat } from '@/features/cats/catStorage';
import { Cat, CatGender } from '@/features/cats/catTypes';
import { nowIso } from '@/utils/date';
import { createId, parseOptionalNumber } from '@/utils/validation';

const genderOptions: { label: string; value: CatGender }[] = [
  { label: '男の子', value: 'male' },
  { label: '女の子', value: 'female' },
  { label: '不明', value: 'unknown' },
];

export default function CatProfileScreen() {
  const router = useRouter();
  const [current, setCurrent] = useState<Cat | undefined>();
  const [name, setName] = useState('');
  const [birthday, setBirthday] = useState('');
  const [age, setAge] = useState('');
  const [weight, setWeight] = useState('');
  const [gender, setGender] = useState<CatGender>('unknown');
  const [memo, setMemo] = useState('');

  useFocusEffect(
    useCallback(() => {
      getPrimaryCat().then((cat) => {
        if (!cat) return;
        setCurrent(cat);
        setName(cat.name);
        setBirthday(cat.birthday ?? '');
        setAge(cat.age?.toString() ?? '');
        setWeight(cat.weight?.toString() ?? '');
        setGender(cat.gender);
        setMemo(cat.memo ?? '');
      });
    }, []),
  );

  const save = async () => {
    if (!name.trim()) {
      Alert.alert('入力を確認してください', '猫の名前は必須です。');
      return;
    }
    const now = nowIso();
    await saveCat({
      id: current?.id ?? createId('cat'),
      name: name.trim(),
      birthday: birthday.trim() || undefined,
      age: parseOptionalNumber(age),
      weight: parseOptionalNumber(weight),
      gender,
      memo: memo.trim() || undefined,
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
    });
    router.back();
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.lead}>最初は1匹分だけ登録できます。あとから多頭飼い対応しやすい形で保存します。</Text>
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
    padding: 18,
    paddingBottom: 36,
  },
  lead: {
    color: colors.subText,
    fontSize: 14,
    lineHeight: 21,
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
