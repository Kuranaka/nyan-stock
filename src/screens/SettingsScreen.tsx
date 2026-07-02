import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';

import { AppButton } from '@/components/AppButton';
import { AppCard } from '@/components/AppCard';
import { AppTextInput } from '@/components/AppTextInput';
import { colors } from '@/constants/colors';
import { getInventoryItems } from '@/features/inventory/inventoryStorage';
import { scheduleInventoryNotifications } from '@/features/notifications/notificationService';
import { getSettings, saveSettings } from '@/features/settings/settingsStorage';
import { AppSettings } from '@/features/settings/settingsTypes';
import { storageKeys } from '@/features/storageKeys';

export default function SettingsScreen() {
  const router = useRouter();
  const [settings, setSettings] = useState<AppSettings | undefined>();
  const [hour, setHour] = useState('9');
  const [minute, setMinute] = useState('0');

  const load = useCallback(async () => {
    const next = await getSettings();
    setSettings(next);
    setHour(String(next.notificationHour));
    setMinute(String(next.notificationMinute));
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const persist = async (patch: Partial<AppSettings>) => {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    await saveSettings(next);
    const items = await getInventoryItems();
    await scheduleInventoryNotifications(items, next);
  };

  const saveTime = async () => {
    const notificationHour = Math.max(0, Math.min(23, Number(hour) || 0));
    const notificationMinute = Math.max(0, Math.min(59, Number(minute) || 0));
    await persist({ notificationHour, notificationMinute });
    setHour(String(notificationHour));
    setMinute(String(notificationMinute));
  };

  const resetData = () => {
    Alert.alert('データを初期化しますか？', '猫プロフィール、在庫、購入履歴、設定を削除します。', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '初期化する',
        style: 'destructive',
        onPress: async () => {
          await Promise.all(Object.values(storageKeys).map((key) => AsyncStorage.removeItem(key)));
          await load();
          router.replace('/');
        },
      },
    ]);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <AppCard style={styles.card}>
        <View style={styles.switchRow}>
          <View style={styles.switchText}>
            <Text style={styles.title}>通知</Text>
            <Text style={styles.note}>在庫切れの前にローカル通知でお知らせします。</Text>
          </View>
          <Switch
            value={Boolean(settings?.notificationsEnabled)}
            onValueChange={(value) => void persist({ notificationsEnabled: value })}
            trackColor={{ false: colors.border, true: colors.primaryLight }}
            thumbColor={settings?.notificationsEnabled ? colors.primary : colors.card}
          />
        </View>
        <View style={styles.timeRow}>
          <AppTextInput label="時" value={hour} onChangeText={setHour} keyboardType="numeric" />
          <AppTextInput label="分" value={minute} onChangeText={setMinute} keyboardType="numeric" />
        </View>
        <AppButton title="通知時間を保存" variant="secondary" onPress={() => void saveTime()} />
      </AppCard>

      <AppCard style={styles.card}>
        <AppButton title="猫プロフィール編集" onPress={() => router.push('/cat-profile')} />
        <AppButton title="アフィリエイトについて" variant="secondary" onPress={() => router.push('/affiliate')} />
        <AppButton title="プライバシーポリシー" variant="secondary" onPress={() => router.push('/privacy')} />
        <AppButton title="利用規約" variant="secondary" onPress={() => router.push('/terms')} />
        <AppButton title="データ初期化" variant="danger" onPress={resetData} />
      </AppCard>

      <AppCard>
        <Text style={styles.title}>アプリ情報</Text>
        <Text style={styles.note}>にゃんストック 1.0.0</Text>
        <Text style={styles.note}>初期版はログイン不要で、データは端末内に保存します。</Text>
      </AppCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 14,
    padding: 18,
    paddingBottom: 40,
  },
  card: {
    gap: 14,
  },
  switchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 14,
  },
  switchText: {
    flex: 1,
  },
  title: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  note: {
    color: colors.subText,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 4,
  },
  timeRow: {
    flexDirection: 'row',
    gap: 12,
  },
});
