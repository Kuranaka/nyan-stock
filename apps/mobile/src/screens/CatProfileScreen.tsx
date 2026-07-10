import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EventArg, NavigationAction } from '@react-navigation/native';
import { Alert, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';

import { AppButton } from '@/components/AppButton';
import { AppCard } from '@/components/AppCard';
import { AppTextInput } from '@/components/AppTextInput';
import { DatePickerField } from '@/components/DatePickerField';
import { colors } from '@/constants/colors';
import { deleteCat, getCat, getCats, saveCat } from '@/features/cats/catStorage';
import { Cat, CatGender } from '@/features/cats/catTypes';
import { deleteInventoryItemsForCat, getInventoryItems } from '@/features/inventory/inventoryStorage';
import { clearIconReference, hasIconUploadStorage, pickAndUploadIcon, saveIconReference } from '@/features/media/iconUpload';
import { scheduleInventoryNotifications } from '@/features/notifications/notificationService';
import { getSettings, updateSettings } from '@/features/settings/settingsStorage';
import { canCreateCat, getSubscriptionEntitlement } from '@/features/subscription/subscriptionService';
import { formatAgeFromBirthday, isFutureIsoDate, nowIso } from '@/utils/date';
import { createId, parseOptionalNumber } from '@/utils/validation';

const genderOptions: { label: string; value: CatGender }[] = [
  { label: '男の子', value: 'male' },
  { label: '女の子', value: 'female' },
  { label: '不明', value: 'unknown' },
];

type CatProfileSnapshot = {
  profileId?: string;
  name: string;
  birthday: string;
  weight: string;
  gender: CatGender;
  iconUrl?: string;
  memo: string;
};

export default function CatProfileScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const initialProfileSnapshotRef = useRef<CatProfileSnapshot | undefined>(undefined);
  const scrollViewRef = useRef<ScrollView>(null);
  const fieldYRefs = useRef<Partial<Record<'name' | 'birthday', number>>>({});
  const allowNextRemoveRef = useRef(false);
  const [cats, setCats] = useState<Cat[]>([]);
  const [current, setCurrent] = useState<Cat | undefined>();
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [draftCatId, setDraftCatId] = useState(() => createId('cat'));
  const [name, setName] = useState('');
  const [birthday, setBirthday] = useState('');
  const [weight, setWeight] = useState('');
  const [gender, setGender] = useState<CatGender>('unknown');
  const [iconUrl, setIconUrl] = useState<string | undefined>();
  const [iconUploading, setIconUploading] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [deletingProfile, setDeletingProfile] = useState(false);
  const [memo, setMemo] = useState('');
  const [formInitialized, setFormInitialized] = useState(false);

  const profileSnapshot = useMemo<CatProfileSnapshot>(
    () => ({
      profileId: current?.id,
      name,
      birthday,
      weight,
      gender,
      iconUrl,
      memo,
    }),
    [birthday, current?.id, gender, iconUrl, memo, name, weight],
  );

  const hasUnsavedChanges = useMemo(() => {
    const initialSnapshot = initialProfileSnapshotRef.current;
    if (!formInitialized || !initialSnapshot) return false;
    return JSON.stringify(initialSnapshot) !== JSON.stringify(profileSnapshot);
  }, [formInitialized, profileSnapshot]);

  const scrollToY = useCallback((y: number) => {
    setTimeout(() => {
      scrollViewRef.current?.scrollTo({
        y: Math.max(y - 12, 0),
        animated: true,
      });
    }, 100);
  }, []);

  const setFieldY = useCallback((field: 'name' | 'birthday') => {
    return (event: LayoutChangeEvent) => {
      fieldYRefs.current[field] = event.nativeEvent.layout.y;
    };
  }, []);

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

  const goBackWithDiscardConfirmation = useCallback(() => {
    confirmDiscardChanges(() => {
      allowNextRemoveRef.current = true;
      router.back();
    });
  }, [confirmDiscardChanges, router]);

  useEffect(() => {
    if (!formInitialized || initialProfileSnapshotRef.current) return;
    initialProfileSnapshotRef.current = profileSnapshot;
  }, [formInitialized, profileSnapshot]);

  useEffect(() => {
    return navigation.addListener(
      'beforeRemove',
      (event: EventArg<'beforeRemove', true, { action: NavigationAction }>) => {
        if (allowNextRemoveRef.current || !hasUnsavedChanges) return;
        event.preventDefault();
        confirmDiscardChanges(() => {
          allowNextRemoveRef.current = true;
          navigation.dispatch(event.data.action);
        });
      },
    );
  }, [confirmDiscardChanges, hasUnsavedChanges, navigation]);

  const resetForm = useCallback(() => {
    const nextDraftCatId = createId('cat');
    setCurrent(undefined);
    setDraftCatId(nextDraftCatId);
    setName('');
    setBirthday('');
    setWeight('');
    setGender('unknown');
    setIconUrl(undefined);
    setMemo('');
    initialProfileSnapshotRef.current = {
      profileId: undefined,
      name: '',
      birthday: '',
      weight: '',
      gender: 'unknown',
      iconUrl: undefined,
      memo: '',
    };
    setFormInitialized(true);
  }, []);

  const fillForm = useCallback((cat: Cat) => {
    setIsCreatingNew(false);
    setCurrent(cat);
    setName(cat.name);
    setBirthday(cat.birthday ?? '');
    setWeight(cat.weight?.toString() ?? '');
    setGender(cat.gender);
    setIconUrl(cat.iconUrl);
    setMemo(cat.memo ?? '');
    initialProfileSnapshotRef.current = {
      profileId: cat.id,
      name: cat.name,
      birthday: cat.birthday ?? '',
      weight: cat.weight?.toString() ?? '',
      gender: cat.gender,
      iconUrl: cat.iconUrl,
      memo: cat.memo ?? '',
    };
    setFormInitialized(true);
  }, []);

  const load = useCallback(async () => {
    const nextCats = await getCats();
    setCats(nextCats);
    if (isCreatingNew) return;
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
  }, [current, fillForm, id, isCreatingNew, resetForm]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const save = async () => {
    if (savingProfile) return;
    if (!name.trim()) {
      scrollToY(fieldYRefs.current.name ?? 0);
      Alert.alert('入力を確認してください', '猫の名前は必須です。');
      return;
    }
    if (birthday && isFutureIsoDate(birthday)) {
      scrollToY(fieldYRefs.current.birthday ?? 0);
      Alert.alert('入力を確認してください', '誕生日は今日以前の日付を選んでください。');
      return;
    }
    let shouldNavigateToInventoryAfterSave = false;
    if (!current) {
      const entitlement = await getSubscriptionEntitlement();
      const latestCats = await getCats();
      if (!canCreateCat(entitlement, latestCats.length)) {
        Alert.alert(
          '無料プランでは猫は2匹までです',
          'Plusにすると、猫プロフィールを無制限に登録できます。',
          [
            { text: 'あとで', style: 'cancel' },
            { text: 'Plusを見る', onPress: () => router.push('/subscription') },
          ],
        );
        return;
      }
      shouldNavigateToInventoryAfterSave = latestCats.length === 0;
    }
    const now = nowIso();
    const catId = current?.id ?? draftCatId;
    setSavingProfile(true);
    try {
      await saveCat({
        id: catId,
        name: name.trim(),
        iconUrl,
        birthday: birthday.trim() || undefined,
        weight: parseOptionalNumber(weight),
        gender,
        memo: memo.trim() || undefined,
        createdAt: current?.createdAt ?? now,
        updatedAt: now,
      });
      await saveIconReference('cat', catId, iconUrl);
      await updateSettings({ selectedCatId: catId });
      const nextCats = await getCats();
      const savedCat = await getCat(catId);
      setCats(nextCats);
      if (savedCat) fillForm(savedCat);
      if (shouldNavigateToInventoryAfterSave) {
        allowNextRemoveRef.current = true;
        router.replace('/');
        return;
      }
      Alert.alert('保存しました', `${name.trim()}のプロフィールを保存しました。`);
    } catch (error) {
      Alert.alert('保存できませんでした', error instanceof Error ? error.message : '時間をおいてもう一度お試しください。');
    } finally {
      setSavingProfile(false);
    }
  };

  const startNew = async () => {
    const entitlement = await getSubscriptionEntitlement();
    if (!canCreateCat(entitlement, cats.length)) {
      Alert.alert(
        '無料プランでは猫は2匹までです',
        'Plusにすると、猫プロフィールを無制限に登録できます。',
        [
          { text: 'あとで', style: 'cancel' },
          { text: 'Plusを見る', onPress: () => router.push('/subscription') },
        ],
      );
      return;
    }
    setIsCreatingNew(true);
    resetForm();
  };

  const selectIcon = async () => {
    const catId = current?.id ?? draftCatId;
    if (!hasIconUploadStorage()) {
      Alert.alert('保存先が未設定です', 'SupabaseのURLとAnon Keyを設定すると、アイコンをサーバーに保存できます。');
      return;
    }

    try {
      setIconUploading(true);
      const result = await pickAndUploadIcon({ kind: 'cats', ownerId: catId });
      if (result.status === 'uploaded') {
        setIconUrl(result.url);
      }
    } catch (error) {
      Alert.alert('アイコンを保存できませんでした', error instanceof Error ? error.message : '時間をおいてもう一度お試しください。');
    } finally {
      setIconUploading(false);
    }
  };

  const remove = () => {
    if (!current || deletingProfile) return;
    Alert.alert(
      '猫プロフィールを削除しますか？',
      `${current.name}のプロフィールを削除します。この猫だけに紐づく在庫は削除され、購入履歴は残ります。共有中の商品は他の猫の在庫として残ります。`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除する',
          style: 'destructive',
          onPress: async () => {
            const deletedCatId = current.id;
            setDeletingProfile(true);
            try {
              await deleteInventoryItemsForCat(deletedCatId);
              await deleteCat(deletedCatId);
              await clearIconReference('cat', deletedCatId);
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
            } catch (error) {
              Alert.alert('削除できませんでした', error instanceof Error ? error.message : '時間をおいてもう一度お試しください。');
            } finally {
              setDeletingProfile(false);
            }
          },
        },
      ],
    );
  };

  return (
    <ScrollView ref={scrollViewRef} contentContainerStyle={styles.container}>
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
          <AppButton title="新しく追加" variant="secondary" onPress={() => void startNew()} />
        </AppCard>
      ) : null}

      <Text style={styles.sectionTitle}>{current ? 'プロフィール編集' : 'プロフィール追加'}</Text>
      <FieldLabel label="アイコン" requirement="optional" />
      <View style={styles.iconRow}>
        {iconUrl ? (
          <Image source={{ uri: iconUrl }} style={styles.catIcon} resizeMode="cover" />
        ) : (
          <View style={styles.catIconPlaceholder}>
            <Text style={styles.catIconPlaceholderText}>猫</Text>
          </View>
        )}
        <View style={styles.iconActions}>
          <AppButton
            title={iconUploading ? 'アップロード中...' : iconUrl ? '別のアイコンに変更' : 'アイコンを選ぶ'}
            variant="secondary"
            disabled={iconUploading}
            onPress={() => void selectIcon()}
          />
          {iconUrl ? <AppButton title="削除" variant="ghost" onPress={() => setIconUrl(undefined)} /> : null}
        </View>
      </View>
      <View onLayout={setFieldY('name')}>
        <AppTextInput label="猫の名前" value={name} onChangeText={setName} placeholder="例：ミルク" requirement="required" />
      </View>
      <View onLayout={setFieldY('birthday')}>
        <DatePickerField
          label="誕生日"
          value={birthday}
          onChange={setBirthday}
          requirement="optional"
          placeholder="未設定"
        />
      </View>
      <View style={styles.ageBox}>
        <Text style={styles.ageLabel}>年齢</Text>
        <Text style={styles.ageValue}>{formatAgeFromBirthday(birthday)}</Text>
      </View>
      <AppTextInput
        label="体重"
        value={weight}
        onChangeText={setWeight}
        keyboardType="decimal-pad"
        placeholder="例：4.2"
        requirement="optional"
      />
      <FieldLabel label="性別" requirement="required" />
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
        requirement="optional"
      />
      <AppButton title={savingProfile ? '保存中...' : '保存する'} loading={savingProfile} onPress={() => void save()} />
      <AppButton title="閉じる" variant="secondary" disabled={savingProfile} onPress={goBackWithDiscardConfirmation} />
      {current ? (
        <AppCard style={styles.dangerZone}>
          <Text style={styles.dangerZoneTitle}>削除</Text>
          <Text style={styles.dangerZoneText}>この猫だけに紐づく在庫を削除します。購入履歴は残ります。</Text>
          <AppButton
            title={deletingProfile ? '削除中...' : 'この猫を削除'}
            variant="danger"
            loading={deletingProfile}
            onPress={remove}
          />
        </AppCard>
      ) : null}
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

const styles = StyleSheet.create({
  container: {
    gap: 16,
    padding: 18,
    paddingBottom: 36,
  },
  card: {
    gap: 12,
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
  iconRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
  },
  catIcon: {
    backgroundColor: colors.muted,
    borderColor: colors.border,
    borderRadius: 36,
    borderWidth: 1,
    height: 72,
    width: 72,
  },
  catIconPlaceholder: {
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    borderColor: colors.border,
    borderRadius: 36,
    borderWidth: 1,
    height: 72,
    justifyContent: 'center',
    width: 72,
  },
  catIconPlaceholderText: {
    color: colors.primaryDark,
    fontSize: 18,
    fontWeight: '900',
  },
  iconActions: {
    flex: 1,
    gap: 8,
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
  ageBox: {
    backgroundColor: colors.muted,
    borderRadius: 12,
    gap: 4,
    padding: 14,
  },
  ageLabel: {
    color: colors.subText,
    fontSize: 12,
    fontWeight: '700',
  },
  ageValue: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
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
