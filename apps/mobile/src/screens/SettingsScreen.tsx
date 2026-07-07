import { useCallback, useState } from 'react';
import { Alert, DeviceEventEmitter, ScrollView, Share, StyleSheet, Switch, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect, useRouter } from 'expo-router';

import { AppButton } from '@/components/AppButton';
import { AppCard } from '@/components/AppCard';
import { AppTextInput } from '@/components/AppTextInput';
import { SignInButtons } from '@/components/SignInButtons';
import { colors } from '@/constants/colors';
import { insertSeedData } from '@/data/seedData';
import { clearAuthSession } from '@/features/auth/authStorage';
import { AuthSession } from '@/features/auth/authTypes';
import { getCurrentAuthSession, signOutSupabaseAuth } from '@/features/auth/supabaseAuth';
import { getInventoryItems } from '@/features/inventory/inventoryStorage';
import { scheduleInventoryNotifications } from '@/features/notifications/notificationService';
import { resetReviewPromptState, showReviewPromptForDebug } from '@/features/review/reviewPrompt';
import { getSettings, saveSettings } from '@/features/settings/settingsStorage';
import { AppSettings } from '@/features/settings/settingsTypes';
import { storageKeys } from '@/features/storageKeys';
import {
  createHouseholdSyncSpace,
  isHouseholdSyncConfigured,
  joinHouseholdSyncSpace,
  pullCurrentHouseholdSnapshot,
  pushCurrentHouseholdSnapshot,
} from '@/features/sync/householdSyncService';
import { clearHouseholdSyncState, getHouseholdSyncState } from '@/features/sync/householdSyncStorage';
import { HouseholdSyncState } from '@/features/sync/householdSyncTypes';
import { householdRealtimeResubscribeEventName } from '@/features/sync/householdRealtime';
import { useHouseholdSyncEvents } from '@/features/sync/useHouseholdSyncEvents';
import { formatDisplayDate } from '@/utils/date';

export default function SettingsScreen() {
  const router = useRouter();
  const [settings, setSettings] = useState<AppSettings | undefined>();
  const [authSession, setAuthSession] = useState<AuthSession | undefined>();
  const [syncState, setSyncState] = useState<HouseholdSyncState | undefined>();
  const [joinCode, setJoinCode] = useState('');
  const [syncBusy, setSyncBusy] = useState(false);
  const [hour, setHour] = useState('9');
  const [minute, setMinute] = useState('0');

  const load = useCallback(async () => {
    const [next, nextAuthSession, nextSyncState] = await Promise.all([
      getSettings(),
      getCurrentAuthSession(),
      getHouseholdSyncState(),
    ]);
    setSettings(next);
    setAuthSession(nextAuthSession);
    setSyncState(nextSyncState);
    setHour(String(next.notificationHour));
    setMinute(String(next.notificationMinute));
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  useHouseholdSyncEvents(() => {
    void load();
  });

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

  const addSeedData = () => {
    Alert.alert('サンプルデータを追加しますか？', '開発確認用の猫プロフィールと在庫2件を追加します。既存データは削除しません。', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '追加する',
        onPress: async () => {
          const result = await insertSeedData();
          const nextSettings = await getSettings();
          const items = await getInventoryItems();
          setSettings(nextSettings);
          await scheduleInventoryNotifications(items, nextSettings);
          Alert.alert('追加しました', `${result.cat.name} と在庫${result.items.length}件を追加しました。`);
        },
      },
    ]);
  };

  const resetReviewPrompt = async () => {
    await resetReviewPromptState();
    Alert.alert('リセットしました', 'レビュー案内の表示状態をリセットしました。');
  };

  const signOut = () => {
    Alert.alert('ログアウトしますか？', 'この端末の共有参加も解除します。クラウド側の共有データは削除されません。', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: 'ログアウト',
        style: 'destructive',
        onPress: async () => {
          try {
            await signOutSupabaseAuth();
          } catch {
            await clearAuthSession();
          }
          await clearHouseholdSyncState();
          setAuthSession(undefined);
          setSyncState(undefined);
          DeviceEventEmitter.emit(householdRealtimeResubscribeEventName);
        },
      },
    ]);
  };

  const runSyncAction = async (
    successTitle: string,
    action: () => Promise<HouseholdSyncState>,
    successMessage?: (state: HouseholdSyncState) => string,
  ) => {
    setSyncBusy(true);
    try {
      const nextState = await action();
      const nextAuthSession = await getCurrentAuthSession();
      setSyncState(nextState);
      setAuthSession(nextAuthSession);
      DeviceEventEmitter.emit(householdRealtimeResubscribeEventName);
      const message = successMessage?.(nextState);
      const guestMessage =
        nextAuthSession?.provider === 'guest' ? 'ゲストとして共有に参加しました。このゲストはこの端末に紐づきます。' : undefined;
      Alert.alert(successTitle, [message, guestMessage].filter(Boolean).join('\n\n') || undefined);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'しばらくしてからもう一度お試しください。';
      Alert.alert('共有に失敗しました', message);
    } finally {
      setSyncBusy(false);
    }
  };

  const createSharedSpace = () => {
    if (!isSignedInAccount(authSession)) {
      Alert.alert(
        'ログインが必要です',
        '家族や他アカウントに渡す共有コードを作成するには、GoogleまたはAppleでログインしてください。共有コードで参加するだけならゲストでも利用できます。',
      );
      return;
    }

    void runSyncAction(
      '共有コードを作成しました',
      createHouseholdSyncSpace,
      (state) => `このコードを共有したい相手に渡してください。\n${state.inviteCode ?? state.householdId}`,
    );
  };

  const pushSharedData = () => {
    void runSyncAction('共有データを更新しました', pushCurrentHouseholdSnapshot);
  };

  const pullSharedData = () => {
    Alert.alert('共有データを取り込みますか？', 'この端末の猫プロフィール、在庫、購入履歴を共有データで上書きします。', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '取り込む',
        onPress: () => {
          void runSyncAction('共有データを取り込みました', pullCurrentHouseholdSnapshot);
        },
      },
    ]);
  };

  const joinSharedSpace = () => {
    Alert.alert('共有スペースに参加しますか？', 'この端末の猫プロフィール、在庫、購入履歴を共有データで上書きします。', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '参加する',
        onPress: () => {
          void runSyncAction('共有スペースに参加しました', () => joinHouseholdSyncSpace(joinCode), (state) => {
            setJoinCode('');
            return `共有コード: ${state.inviteCode ?? state.householdId}`;
          });
        },
      },
    ]);
  };

  const shareHouseholdCode = () => {
    if (!syncState) return;
    void Share.share({
      message: `にゃんストックの共有コード: ${syncState.inviteCode ?? syncState.householdId}`,
    });
  };

  const copyHouseholdCode = async () => {
    if (!syncState) return;
    try {
      await Clipboard.setStringAsync(syncState.inviteCode ?? syncState.householdId);
      Alert.alert('コピーしました', '共有コードをクリップボードにコピーしました。');
    } catch {
      Alert.alert('コピーできませんでした', '共有コードを選択してコピーしてください。');
    }
  };

  const leaveSharedSpace = () => {
    Alert.alert(
      '共有を解除しますか？',
      'この端末だけ共有スペースから外します。端末内の現在のデータとクラウド側の共有データは削除されません。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '解除する',
          style: 'destructive',
          onPress: async () => {
            await clearHouseholdSyncState();
            setSyncState(undefined);
            DeviceEventEmitter.emit(householdRealtimeResubscribeEventName);
            Alert.alert('共有を解除しました', '別の共有コードで再参加できます。');
          },
        },
      ],
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <AppCard style={styles.card}>
        <Text style={styles.title}>アカウント</Text>
        {authSession ? (
          <>
            <Text style={styles.note}>
              {authSession.provider === 'guest' ? 'ゲストで利用中' : `${authProviderLabels[authSession.provider]}でログイン中`}
              {authSession.name ? `：${authSession.name}` : ''}
            </Text>
            {authSession.email ? <Text style={styles.note}>{authSession.email}</Text> : null}
            {authSession.provider === 'guest' ? (
              <Text style={styles.note}>このゲストは端末に紐づきます。アプリ削除や端末変更では復元できない場合があります。</Text>
            ) : null}
            <AppButton title="ログアウト" variant="secondary" onPress={signOut} />
          </>
        ) : (
          <>
            <Text style={styles.note}>GoogleまたはAppleでログインできます。</Text>
            <SignInButtons onSignedIn={setAuthSession} />
          </>
        )}
      </AppCard>

      <AppCard style={styles.card}>
        <Text style={styles.title}>家族・他アカウントと共有</Text>
        <Text style={styles.note}>
          共有コードで参加すると、猫プロフィール、在庫、購入履歴はクラウド側を保存先として参照・更新します。
        </Text>
        {!isHouseholdSyncConfigured() ? (
          <Text style={styles.warningText}>Supabase URLとAnon Keyを設定すると共有を使えます。</Text>
        ) : null}
        {syncState ? (
          <>
            <View style={styles.codeBox}>
              <Text style={styles.codeLabel}>共有コード</Text>
              <Text style={styles.codeText}>{syncState.inviteCode ?? syncState.householdId}</Text>
              {syncState.joinedBy ? (
                <Text style={styles.codeNote}>参加アカウント: {syncState.joinedBy}</Text>
              ) : null}
              {syncState.lastPushedAt ? (
                <Text style={styles.codeNote}>最終保存: {formatDisplayDate(syncState.lastPushedAt)}</Text>
              ) : null}
              {syncState.lastPulledAt ? (
                <Text style={styles.codeNote}>最終取り込み: {formatDisplayDate(syncState.lastPulledAt)}</Text>
              ) : null}
            </View>
            <AppButton
              title="共有コードをコピー"
              disabled={syncBusy}
              onPress={() => void copyHouseholdCode()}
            />
            <AppButton
              title="共有コードを送る"
              variant="secondary"
              disabled={syncBusy}
              onPress={shareHouseholdCode}
            />
            <AppButton
              title="この端末だけ共有を解除"
              variant="danger"
              disabled={syncBusy}
              onPress={leaveSharedSpace}
            />
          </>
        ) : (
          <>
            <AppButton
              title="共有コードを作成"
              disabled={syncBusy || !isHouseholdSyncConfigured()}
              onPress={createSharedSpace}
            />
            {!isSignedInAccount(authSession) ? (
              <Text style={styles.note}>共有コードを作成するには、先にGoogleまたはAppleでログインしてください。</Text>
            ) : null}
            <AppTextInput
              label="共有コード"
              value={joinCode}
              onChangeText={setJoinCode}
              autoCapitalize="characters"
              placeholder="NYAN-XXXX-XXXX"
            />
            <AppButton
              title="共有スペースに参加"
              variant="secondary"
              disabled={syncBusy || !joinCode.trim() || !isHouseholdSyncConfigured()}
              onPress={joinSharedSpace}
            />
          </>
        )}
      </AppCard>

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
        <AppButton title="猫プロフィール管理" onPress={() => router.push('/cat-profile')} />
        <AppButton title="アフィリエイトについて" variant="secondary" onPress={() => router.push('/affiliate')} />
        <AppButton title="プライバシーポリシー" variant="secondary" onPress={() => router.push('/privacy')} />
        <AppButton title="利用規約" variant="secondary" onPress={() => router.push('/terms')} />
        <AppButton title="データ初期化" variant="danger" onPress={resetData} />
      </AppCard>

      {__DEV__ ? (
        <>
          <AppCard style={styles.card}>
            <Text style={styles.title}>開発用データ</Text>
            <Text style={styles.note}>動作確認用のプロフィールと在庫を端末内に追加します。</Text>
            <AppButton title="サンプルデータを追加" variant="secondary" onPress={addSeedData} />
            <Text style={styles.note}>レビュー案内の動作確認用です。本番ビルドには表示されません。</Text>
            <AppButton title="レビュー案内をテスト表示" variant="secondary" onPress={showReviewPromptForDebug} />
            <AppButton title="レビュー案内をリセット" variant="secondary" onPress={() => void resetReviewPrompt()} />
            {syncState ? (
              <>
                <Text style={styles.note}>同期確認用の手動操作です。</Text>
                <AppButton
                  title="今すぐクラウドに保存"
                  disabled={syncBusy || !isHouseholdSyncConfigured()}
                  onPress={pushSharedData}
                />
                <AppButton
                  title="クラウドから再読み込み"
                  variant="secondary"
                  disabled={syncBusy || !isHouseholdSyncConfigured()}
                  onPress={pullSharedData}
                />
              </>
            ) : null}
          </AppCard>

          <AppCard style={styles.card}>
            <Text style={styles.title}>未実装・TODO</Text>
            {todoItems.map((item) => (
              <View key={item.label} style={styles.todoRow}>
                <Text style={styles.todoDot}>•</Text>
                <View style={styles.todoBody}>
                  <Text style={styles.todoText}>{item.label}</Text>
                  <Text style={[styles.todoStatus, item.done && styles.todoStatusDone]}>{item.status}</Text>
                </View>
              </View>
            ))}
          </AppCard>
        </>
      ) : null}

      <AppCard>
        <Text style={styles.title}>アプリ情報</Text>
        <Text style={styles.note}>にゃんストック 1.0.0</Text>
        <Text style={styles.note}>共有スペース参加後の在庫データはクラウド側に保存します。</Text>
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
  warningText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
  },
  codeBox: {
    backgroundColor: colors.muted,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
    padding: 12,
  },
  codeLabel: {
    color: colors.subText,
    fontSize: 12,
    fontWeight: '700',
  },
  codeText: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '900',
  },
  codeNote: {
    color: colors.subText,
    fontSize: 12,
    lineHeight: 17,
  },
  todoRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 8,
  },
  todoDot: {
    color: colors.primaryDark,
    fontSize: 15,
    lineHeight: 22,
  },
  todoText: {
    color: colors.subText,
    fontSize: 14,
    lineHeight: 22,
  },
  todoBody: {
    flex: 1,
  },
  todoStatus: {
    color: colors.subText,
    fontSize: 12,
    lineHeight: 18,
  },
  todoStatusDone: {
    color: colors.success,
    fontWeight: '700',
  },
  timeRow: {
    flexDirection: 'row',
    gap: 12,
  },
});

const todoItems = [
  { label: 'Google / Appleログイン', status: '任意ログインに対応済み', done: true },
  { label: 'Xログイン', status: '実装下地あり。今は非表示・未使用' },
  { label: '共有コードによるクラウド共有', status: 'Supabase参照・保存に対応済み', done: true },
  { label: 'リアルタイム同期、自動マージ', status: '初期版では未対応' },
  { label: 'EC API連携、商品検索', status: 'Supabase Edge Function経由の検索に対応済み', done: true },
  { label: 'バーコード、OCR', status: '初期版では未対応' },
  { label: '多頭飼いUIの完全対応', status: 'プロフィール管理と在庫の猫別表示を追加済み', done: true },
  { label: '正式なアプリアイコン/スプラッシュ画像', status: 'Expo設定に追加済み', done: true },
  { label: 'seedデータ投入UI', status: '設定画面に追加済み', done: true },
];

const authProviderLabels = {
  guest: 'ゲスト',
  google: 'Google',
  apple: 'Apple',
  x: 'X',
} satisfies Record<AuthSession['provider'], string>;

function isSignedInAccount(session: AuthSession | undefined): boolean {
  return session?.provider === 'google' || session?.provider === 'apple';
}
