import { ReactNode, useCallback, useState } from 'react';
import {
  Alert,
  DeviceEventEmitter,
  Image,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/AppButton';
import { AppCard } from '@/components/AppCard';
import { AppTextInput } from '@/components/AppTextInput';
import { SignInButtons } from '@/components/SignInButtons';
import { colors } from '@/constants/colors';
import { insertSeedData } from '@/data/seedData';
import { areAdMobPrivacyOptionsRequired, showAdMobPrivacyOptions } from '@/features/ads/adMob';
import { clearAuthSession } from '@/features/auth/authStorage';
import { AuthSession } from '@/features/auth/authTypes';
import {
  deleteSupabaseAccount,
  getCurrentAuthSession,
  signOutSupabaseAuth,
} from '@/features/auth/supabaseAuth';
import { getInventoryItems } from '@/features/inventory/inventoryStorage';
import {
  cancelAllInventoryNotifications,
  scheduleInventoryNotifications,
  scheduleTestInventoryNotification,
} from '@/features/notifications/notificationService';
import { submitSupportInquiry } from '@/features/reports/supportInquiryService';
import { resetReviewPromptState, showReviewPromptForDebug } from '@/features/review/reviewPrompt';
import {
  getSettings,
  onboardingVisibilityEventName,
  saveSettings,
} from '@/features/settings/settingsStorage';
import { AppSettings } from '@/features/settings/settingsTypes';
import { storageKeys } from '@/features/storageKeys';
import { createSubscriptionEntitlement } from '@/features/subscription/subscriptionService';
import {
  createHouseholdSyncSpace,
  HouseholdMember,
  isHouseholdSyncConfigured,
  joinHouseholdSyncSpace,
  listHouseholdMembers,
  pullCurrentHouseholdSnapshot,
  pushCurrentHouseholdSnapshot,
  regenerateHouseholdInviteCode,
  removeHouseholdMember,
} from '@/features/sync/householdSyncService';
import {
  clearHouseholdSyncState,
  getHouseholdSyncState,
} from '@/features/sync/householdSyncStorage';
import { HouseholdSyncState } from '@/features/sync/householdSyncTypes';
import { householdRealtimeResubscribeEventName } from '@/features/sync/householdRealtime';
import { useHouseholdSyncEvents } from '@/features/sync/useHouseholdSyncEvents';
import { formatDisplayDate } from '@/utils/date';
import googleLogo from '@/assets/google-g-logo.png';

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [settings, setSettings] = useState<AppSettings | undefined>();
  const [authSession, setAuthSession] = useState<AuthSession | undefined>();
  const [syncState, setSyncState] = useState<HouseholdSyncState | undefined>();
  const [sharedMembers, setSharedMembers] = useState<HouseholdMember[]>([]);
  const [joinCode, setJoinCode] = useState('');
  const [joinName, setJoinName] = useState('');
  const [syncBusy, setSyncBusy] = useState(false);
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [hour, setHour] = useState('9');
  const [minute, setMinute] = useState('0');
  const [supportMessage, setSupportMessage] = useState('');
  const [supportSubmitting, setSupportSubmitting] = useState(false);
  const [accountDeleting, setAccountDeleting] = useState(false);
  const [adPrivacyOptionsBusy, setAdPrivacyOptionsBusy] = useState(false);
  const [showAdPrivacyOptions, setShowAdPrivacyOptions] = useState(false);

  const load = useCallback(async () => {
    const [next, nextAuthSession, nextSyncState, items] = await Promise.all([
      getSettings(),
      getCurrentAuthSession(),
      getHouseholdSyncState(),
      getInventoryItems(),
    ]);
    const nextSharedMembers = nextSyncState?.createdBy
      ? await listHouseholdMembers().catch(() => [])
      : [];
    await scheduleInventoryNotifications(items, next);
    setSettings(next);
    setAuthSession(nextAuthSession);
    setSyncState(nextSyncState);
    setSharedMembers(nextSharedMembers);
    setHour(String(next.notificationHour));
    setMinute(String(next.notificationMinute));
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
      void areAdMobPrivacyOptionsRequired().then(setShowAdPrivacyOptions);
    }, [load]),
  );
  useHouseholdSyncEvents(() => {
    void load();
  });

  const persist = async (patch: Partial<AppSettings>) => {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setNotificationBusy(true);
    try {
      setSettings(next);
      await saveSettings(next);
      const items = await getInventoryItems();
      await scheduleInventoryNotifications(items, next);
    } catch (error) {
      Alert.alert(
        '通知設定を保存できませんでした',
        error instanceof Error ? error.message : '時間をおいてもう一度お試しください。',
      );
      await load();
    } finally {
      setNotificationBusy(false);
    }
  };

  const saveTime = async () => {
    const notificationHour = Math.max(0, Math.min(23, Number(hour) || 0));
    const notificationMinute = Math.max(0, Math.min(59, Number(minute) || 0));
    await persist({ notificationHour, notificationMinute });
    setHour(String(notificationHour));
    setMinute(String(notificationMinute));
  };

  const sendTestNotification = async () => {
    setNotificationBusy(true);
    try {
      const items = await getInventoryItems();
      const sent = await scheduleTestInventoryNotification(items[0]);
      Alert.alert(
        sent ? 'テスト通知を予約しました' : 'テスト通知を送れませんでした',
        sent
          ? '約5秒後に通知が届きます。在庫がある場合は、通知をタップすると商品詳細を開きます。'
          : 'この環境では通知に対応していないか、端末側で通知が許可されていません。',
      );
    } catch (error) {
      Alert.alert(
        'テスト通知を送れませんでした',
        error instanceof Error ? error.message : '時間をおいてもう一度お試しください。',
      );
    } finally {
      setNotificationBusy(false);
    }
  };

  const resetData = () => {
    Alert.alert(
      'データを初期化しますか？',
      'ペットプロフィール、在庫、購入履歴、設定を削除します。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '初期化する',
          style: 'destructive',
          onPress: async () => {
            await cancelAllInventoryNotifications();
            await Promise.all(
              Object.values(storageKeys).map((key) => AsyncStorage.removeItem(key)),
            );
            DeviceEventEmitter.emit(onboardingVisibilityEventName, false);
            await load();
            router.replace('/');
          },
        },
      ],
    );
  };

  const clearLocalDeviceData = async () => {
    await cancelAllInventoryNotifications();
    await Promise.all(Object.values(storageKeys).map((key) => AsyncStorage.removeItem(key)));
  };

  const addSeedData = () => {
    Alert.alert(
      'サンプルデータを追加しますか？',
      '開発確認用のペットプロフィールと在庫2件を追加します。既存データは削除しません。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '追加する',
          onPress: async () => {
            const result = await insertSeedData();
            const nextSettings = await getSettings();
            const items = await getInventoryItems();
            setSettings(nextSettings);
            await scheduleInventoryNotifications(items, nextSettings);
            Alert.alert(
              '追加しました',
              `${result.cat.name} と在庫${result.items.length}件を追加しました。`,
            );
          },
        },
      ],
    );
  };

  const resetReviewPrompt = async () => {
    await resetReviewPromptState();
    Alert.alert('リセットしました', 'レビュー案内の表示状態をリセットしました。');
  };

  const signOut = () => {
    Alert.alert(
      'ログアウトしますか？',
      'ログアウトすると、この端末内のペットプロフィール、在庫、購入履歴、設定が初期化されます。クラウド側の共有データは削除されません。',
      [
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
            await clearLocalDeviceData();
            setAuthSession(undefined);
            setSyncState(undefined);
            DeviceEventEmitter.emit(householdRealtimeResubscribeEventName);
            await load();
            router.replace('/');
          },
        },
      ],
    );
  };

  const deleteAccount = () => {
    Alert.alert(
      'アカウントを削除しますか？',
      'Google・Apple・ゲストのログイン情報、個人用のクラウドデータ、アップロードしたアイコンを削除します。共有スペースに他の参加者がいる場合、その共有データは他の参加者のために残ります。この操作は取り消せません。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: 'アカウントを削除',
          style: 'destructive',
          onPress: async () => {
            setAccountDeleting(true);
            try {
              await deleteSupabaseAccount();
              await clearLocalDeviceData();
              setAuthSession(undefined);
              setSyncState(undefined);
              DeviceEventEmitter.emit(householdRealtimeResubscribeEventName);
              Alert.alert('アカウントを削除しました', 'この端末内のデータも削除しました。');
              router.replace('/');
            } catch (error) {
              Alert.alert(
                'アカウントを削除できませんでした',
                error instanceof Error ? error.message : 'しばらくしてからお試しください。',
              );
            } finally {
              setAccountDeleting(false);
            }
          },
        },
      ],
    );
  };

  const openAdPrivacyOptions = async () => {
    setAdPrivacyOptionsBusy(true);
    try {
      await showAdMobPrivacyOptions();
    } catch (error) {
      Alert.alert(
        '広告のプライバシー設定を開けませんでした',
        error instanceof Error ? error.message : '時間をおいてもう一度お試しください。',
      );
    } finally {
      setAdPrivacyOptionsBusy(false);
    }
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
        nextAuthSession?.provider === 'guest'
          ? 'ゲストとして共有に参加しました。このゲストはこの端末に紐づきます。'
          : undefined;
      Alert.alert(successTitle, [message, guestMessage].filter(Boolean).join('\n\n') || undefined);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'しばらくしてからもう一度お試しください。';
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
      '共有スペースを作成しました',
      createHouseholdSyncSpace,
      (state) =>
        `このコードを共有したい相手に渡してください。\n${state.inviteCode ?? state.householdId}`,
    );
  };

  const pushSharedData = () => {
    void runSyncAction('共有データを更新しました', pushCurrentHouseholdSnapshot);
  };

  const pullSharedData = () => {
    Alert.alert(
      '共有データを取り込みますか？',
      'この端末のペットプロフィール、在庫、購入履歴を共有データで上書きします。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '取り込む',
          onPress: () => {
            void runSyncAction('共有データを取り込みました', pullCurrentHouseholdSnapshot);
          },
        },
      ],
    );
  };

  const joinSharedSpace = () => {
    if (!joinCode.trim()) {
      Alert.alert('共有コードを入力してください');
      return;
    }
    if (!joinName.trim()) {
      Alert.alert('参加名を入力してください', '共有中に表示する名前を入力してください。');
      return;
    }

    Alert.alert(
      '共有スペースに参加しますか？',
      'この端末のペットプロフィール、在庫、購入履歴を共有データで上書きします。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '参加する',
          onPress: () => {
            void runSyncAction(
              '共有スペースに参加しました',
              () => joinHouseholdSyncSpace(joinCode, joinName),
              (state) => {
                setJoinCode('');
                setJoinName('');
                return [
                  `共有コード: ${state.inviteCode ?? state.householdId}`,
                  state.joinedBy ? `参加名: ${state.joinedBy}` : undefined,
                ]
                  .filter(Boolean)
                  .join('\n');
              },
            );
          },
        },
      ],
    );
  };

  const shareHouseholdCode = () => {
    if (!syncState) return;
    const inviteCode = syncState.inviteCode ?? syncState.householdId;
    void Share.share({
      message: [
        'にゃんストックでペット用品を共有しよう🐾',
        '',
        '【共有コード】',
        inviteCode,
        '',
        '上のコードだけをコピーして、',
        'にゃんストックの「設定」→「共有スペースに参加」で、参加名と一緒に入力してください。',
      ].join('\n'),
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

  const regenerateHouseholdCode = () => {
    Alert.alert(
      '共有コードを再発行しますか？',
      '古いコードはすぐに使えなくなります。すでに参加している人の共有は続きます。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '再発行する',
          style: 'destructive',
          onPress: () => {
            void runSyncAction(
              '共有コードを再発行しました',
              regenerateHouseholdInviteCode,
              (state) => `新しい共有コード:\n${state.inviteCode ?? state.householdId}`,
            );
          },
        },
      ],
    );
  };

  const removeSharedMember = (member: HouseholdMember) => {
    const memberLabel = member.displayName || 'この参加者';
    Alert.alert(
      `${memberLabel}を共有から外しますか？`,
      'この参加者は共有データを読み書きできなくなります。参加者の端末内にあるデータは削除されません。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '共有から外す',
          style: 'destructive',
          onPress: async () => {
            setSyncBusy(true);
            try {
              await removeHouseholdMember(member.userId);
              setSharedMembers((members) =>
                members.filter((nextMember) => nextMember.userId !== member.userId),
              );
              Alert.alert(
                '共有から外しました',
                `${memberLabel}は共有データにアクセスできなくなりました。`,
              );
            } catch (error) {
              Alert.alert(
                '共有から外せませんでした',
                error instanceof Error ? error.message : '時間をおいてもう一度お試しください。',
              );
            } finally {
              setSyncBusy(false);
            }
          },
        },
      ],
    );
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

  const sendSupportInquiry = async () => {
    if (supportSubmitting) return;
    if (!supportMessage.trim()) {
      Alert.alert('内容を入力してください', 'お問い合わせ内容を入力してください。');
      return;
    }
    setSupportSubmitting(true);
    try {
      await submitSupportInquiry({ message: supportMessage });
      setSupportMessage('');
      Alert.alert('送信しました', 'お問い合わせありがとうございます。内容を確認します。');
    } catch (error) {
      Alert.alert(
        '送信できませんでした',
        error instanceof Error ? error.message : '時間をおいてもう一度お試しください。',
      );
    } finally {
      setSupportSubmitting(false);
    }
  };

  const plan = settings?.subscriptionPlan ?? 'free';
  const entitlement = createSubscriptionEntitlement(plan);
  const accountLabel = authSession
    ? authSession.provider === 'guest'
      ? 'ゲスト利用中'
      : `${authProviderLabels[authSession.provider]}でログイン中`
    : '未ログイン';
  const syncLabel = syncState ? '共有中' : isHouseholdSyncConfigured() ? '未参加' : '未設定';
  const canLeaveSharedSpace = Boolean(syncState && !syncState.createdBy);

  return (
    <ScrollView
      contentContainerStyle={[styles.container, { paddingTop: Math.max(18, insets.top + 12) }]}
    >
      <View style={styles.header}>
        <Text style={styles.screenTitle}>設定</Text>
        <Text style={styles.screenLead}>通知、共有、アカウントまわりをまとめて管理できます。</Text>
      </View>

      <AppCard style={[styles.card, styles.summaryCard]}>
        <View style={styles.planHeader}>
          <View style={styles.planCopy}>
            <Text style={styles.sectionEyebrow}>現在のプラン</Text>
            <Text style={styles.planName}>
              {plan === 'plus' ? 'にゃんストック Plus' : '無料プラン'}
            </Text>
          </View>
          <View style={[styles.planBadge, plan === 'plus' && styles.planBadgePlus]}>
            <Text style={[styles.planBadgeText, plan === 'plus' && styles.planBadgeTextPlus]}>
              {plan === 'plus' ? 'Plus' : 'Free'}
            </Text>
          </View>
        </View>
        <View style={styles.statGrid}>
          <StatChip label="ペットプロフィール" value={formatLimit(entitlement.catLimit)} />
          <StatChip label="在庫登録" value={formatLimit(entitlement.inventoryLimit)} />
          <StatChip label="広告" value={entitlement.shouldShowAds ? '表示あり' : '非表示'} />
        </View>
        <AppButton title="にゃんストック Plusを見る" onPress={() => router.push('/subscription')} />
      </AppCard>

      <SettingSection title="アカウント" description="ログインをすると共有コードの作成ができます。">
        <View style={styles.accountPanel}>
          <AccountProviderIcon session={authSession} />
          <View style={styles.accountBody}>
            <Text style={styles.accountTitle}>{accountLabel}</Text>
            {authSession?.name ? <Text style={styles.accountMeta}>{authSession.name}</Text> : null}
            {authSession?.email ? (
              <Text style={styles.accountMeta}>{authSession.email}</Text>
            ) : null}
          </View>
        </View>
        {authSession?.provider === 'guest' ? (
          <Text style={styles.note}>
            このゲストは端末に紐づきます。アプリ削除や端末変更では復元できない場合があります。
          </Text>
        ) : null}
        {isSignedInAccount(authSession) ? (
          <AppButton title="ログアウト" variant="secondary" onPress={signOut} />
        ) : (
          <SignInButtons onSignedIn={setAuthSession} />
        )}
      </SettingSection>

      <SettingSection title="通知" description="在庫切れの前に、指定した時間で通知します。">
        <View style={styles.switchRow}>
          <View style={styles.switchText}>
            <Text style={styles.rowTitle}>在庫通知</Text>
            <Text style={styles.rowDescription}>
              {settings?.notificationsEnabled ? 'オン' : 'オフ'}
            </Text>
          </View>
          <Switch
            value={Boolean(settings?.notificationsEnabled)}
            disabled={notificationBusy}
            onValueChange={(value) => void persist({ notificationsEnabled: value })}
            trackColor={{ false: colors.border, true: colors.primaryLight }}
            thumbColor={settings?.notificationsEnabled ? colors.primary : colors.card}
          />
        </View>
        <View style={styles.timeSettingRow}>
          <View style={styles.timeInputItem}>
            <AppTextInput
              label="時"
              value={hour}
              onChangeText={setHour}
              keyboardType="numeric"
              maxLength={2}
              style={styles.timeNumberInput}
            />
          </View>
          <Text style={styles.timeSeparator}>:</Text>
          <View style={styles.timeInputItem}>
            <AppTextInput
              label="分"
              value={minute}
              onChangeText={setMinute}
              keyboardType="numeric"
              maxLength={2}
              style={styles.timeNumberInput}
            />
          </View>
          <AppButton
            title="保存"
            variant="secondary"
            loading={notificationBusy}
            onPress={() => void saveTime()}
            style={styles.saveTimeButton}
          />
        </View>
      </SettingSection>

      <SettingSection
        title="家族・他アカウントと共有"
        description="ペットプロフィール、在庫、購入履歴を共有できます。"
      >
        <View style={styles.syncStatusRow}>
          <Text style={styles.rowTitle}>共有ステータス</Text>
          <Text style={[styles.syncBadge, syncState && styles.syncBadgeActive]}>{syncLabel}</Text>
        </View>
        {!isHouseholdSyncConfigured() ? (
          <Text style={styles.warningText}>Supabase URLとAnon Keyを設定すると共有を使えます。</Text>
        ) : null}
        {syncState ? (
          <>
            <View style={styles.codeBox}>
              <Text style={styles.codeLabel}>共有コード</Text>
              <Text style={styles.codeText}>{syncState.inviteCode ?? syncState.householdId}</Text>
              {syncState.joinedBy ? (
                <InfoLine label="参加アカウント" value={syncState.joinedBy} />
              ) : null}
              {syncState.lastPushedAt ? (
                <InfoLine label="最終保存" value={formatDisplayDate(syncState.lastPushedAt)} />
              ) : null}
              {syncState.lastPulledAt ? (
                <InfoLine label="最終取り込み" value={formatDisplayDate(syncState.lastPulledAt)} />
              ) : null}
            </View>
            <View style={styles.buttonStack}>
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
              {syncState.createdBy ? (
                <AppButton
                  title="共有コードを再発行"
                  variant="secondary"
                  disabled={syncBusy}
                  onPress={regenerateHouseholdCode}
                />
              ) : null}
              {canLeaveSharedSpace ? (
                <AppButton
                  title="この端末だけ共有を解除"
                  variant="danger"
                  disabled={syncBusy}
                  onPress={leaveSharedSpace}
                />
              ) : null}
            </View>
            {syncState.createdBy ? (
              <View style={styles.memberList}>
                <Text style={styles.memberListTitle}>参加者</Text>
                {sharedMembers.filter((member) => member.role === 'member').length === 0 ? (
                  <Text style={styles.note}>まだ参加者はいません。</Text>
                ) : (
                  sharedMembers
                    .filter((member) => member.role === 'member')
                    .map((member, index) => (
                      <View key={member.userId} style={styles.memberRow}>
                        <View style={styles.memberText}>
                          <Text style={styles.rowTitle}>
                            {member.displayName || `参加者 ${index + 1}`}
                          </Text>
                          <Text style={styles.rowDescription}>共有中</Text>
                        </View>
                        <Pressable
                          accessibilityLabel={`${member.displayName || `参加者 ${index + 1}`}を共有から外す`}
                          accessibilityRole="button"
                          disabled={syncBusy}
                          onPress={() => removeSharedMember(member)}
                          style={({ pressed }) => [
                            styles.memberRemoveButton,
                            syncBusy && styles.memberRemoveButtonDisabled,
                            pressed && !syncBusy && styles.memberRemoveButtonPressed,
                          ]}
                        >
                          <Text style={styles.memberRemoveButtonText}>外す</Text>
                        </Pressable>
                      </View>
                    ))
                )}
              </View>
            ) : null}
          </>
        ) : (
          <>
            <AppButton
              title="共有スペースを作成"
              disabled={syncBusy || !isHouseholdSyncConfigured()}
              onPress={createSharedSpace}
            />
            {!isSignedInAccount(authSession) ? (
              <Text style={styles.note}>
                共有コードを作成するには、先にGoogleまたはAppleでログインしてください。
              </Text>
            ) : null}
            <View style={styles.joinForm}>
              <AppTextInput
                label="共有コード"
                value={joinCode}
                onChangeText={setJoinCode}
                autoCapitalize="characters"
                placeholder="NYAN-XXXX-XXXX"
              />
              <AppTextInput
                label="参加名（必須）"
                value={joinName}
                onChangeText={setJoinName}
                placeholder="例: ママのiPhone"
                maxLength={40}
              />
              <AppButton
                title="共有スペースに参加"
                variant="secondary"
                disabled={
                  syncBusy || !joinCode.trim() || !joinName.trim() || !isHouseholdSyncConfigured()
                }
                onPress={joinSharedSpace}
              />
            </View>
          </>
        )}
      </SettingSection>

      <SettingSection title="管理メニュー">
        <SettingRow
          title="ヘルプ・使い方"
          description="商品の登録、通知、共有のしくみを確認"
          onPress={() => router.push('/help')}
        />
        <SettingRow
          title="アフィリエイトについて"
          description="購入リンクの表示方針"
          onPress={() => router.push('/affiliate')}
        />
        <SettingRow
          title="プライバシーポリシー"
          description="データの扱いについて"
          onPress={() => router.push('/privacy')}
        />
        {showAdPrivacyOptions ? (
          <SettingRow
            title="広告のプライバシー設定"
            description={adPrivacyOptionsBusy ? '開いています…' : '広告に関する同意内容を変更'}
            onPress={() => void openAdPrivacyOptions()}
          />
        ) : null}
        <SettingRow
          title="利用規約"
          description="利用条件を確認"
          onPress={() => router.push('/terms')}
        />
      </SettingSection>

      <SettingSection
        title="お問い合わせ"
        description="不具合、使い方で困ったこと、機能のご要望などがあればお知らせください。"
      >
        <AppTextInput
          label="内容"
          value={supportMessage}
          onChangeText={setSupportMessage}
          multiline
          style={styles.supportInput}
          placeholder="例: 通知が届かない、こんな機能がほしい"
        />
        <AppButton
          title={supportSubmitting ? '送信中...' : '送信する'}
          loading={supportSubmitting}
          onPress={() => void sendSupportInquiry()}
        />
      </SettingSection>

      <SettingSection
        title="データ管理"
        description="端末内のデータとログインアカウントを扱う操作です。"
      >
        <AppButton title="データ初期化" variant="danger" onPress={resetData} />
        {authSession?.supabaseUserId ? (
          <>
            <Text style={styles.note}>
              アカウント削除では、ログイン情報と個人用のクラウドデータを削除します。共有相手がいる共有データは残ります。
            </Text>
            <AppButton
              title={accountDeleting ? 'アカウントを削除中...' : 'アカウントを削除'}
              variant="danger"
              loading={accountDeleting}
              disabled={accountDeleting}
              onPress={deleteAccount}
            />
          </>
        ) : null}
      </SettingSection>

      {__DEV__ ? (
        <>
          <AppCard style={styles.card}>
            <Text style={styles.title}>開発用データ</Text>
            <Text style={styles.note}>通知の動作確認用です。本番ビルドには表示されません。</Text>
            <AppButton
              title="テスト通知を送る"
              variant="secondary"
              disabled={notificationBusy}
              onPress={() => void sendTestNotification()}
            />
            <Text style={styles.note}>動作確認用のプロフィールと在庫を端末内に追加します。</Text>
            <AppButton title="サンプルデータを追加" variant="secondary" onPress={addSeedData} />
            <Text style={styles.note}>
              レビュー案内の動作確認用です。本番ビルドには表示されません。
            </Text>
            <AppButton
              title="レビュー案内をテスト表示"
              variant="secondary"
              onPress={showReviewPromptForDebug}
            />
            <AppButton
              title="レビュー案内をリセット"
              variant="secondary"
              onPress={() => void resetReviewPrompt()}
            />
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
                  <Text style={[styles.todoStatus, item.done && styles.todoStatusDone]}>
                    {item.status}
                  </Text>
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

type SettingSectionProps = {
  title: string;
  description?: string;
  children: ReactNode;
};

function SettingSection({ title, description, children }: SettingSectionProps) {
  return (
    <AppCard style={styles.card}>
      <View style={styles.sectionHeader}>
        <Text style={styles.title}>{title}</Text>
        {description ? <Text style={styles.note}>{description}</Text> : null}
      </View>
      {children}
    </AppCard>
  );
}

type SettingRowProps = {
  title: string;
  description: string;
  onPress: () => void;
};

function SettingRow({ title, description, onPress }: SettingRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
    >
      <View style={styles.menuText}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowDescription}>{description}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

type StatChipProps = {
  label: string;
  value: string;
};

function StatChip({ label, value }: StatChipProps) {
  return (
    <View style={styles.statChip}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

type InfoLineProps = {
  label: string;
  value: string;
};

function InfoLine({ label, value }: InfoLineProps) {
  return (
    <View style={styles.infoLine}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

type AccountProviderIconProps = {
  session: AuthSession | undefined;
};

function AccountProviderIcon({ session }: AccountProviderIconProps) {
  if (session?.provider === 'google') {
    return (
      <View style={styles.accountLogoAvatar}>
        <Image
          accessibilityIgnoresInvertColors
          source={googleLogo}
          style={styles.accountGoogleLogo}
        />
      </View>
    );
  }

  const label = session?.provider === 'apple' ? 'A' : session?.provider === 'guest' ? 'ゲ' : '?';

  return (
    <View style={styles.accountAvatar}>
      <Text style={styles.accountAvatarText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    gap: 16,
    padding: 18,
    paddingBottom: 40,
  },
  header: {
    gap: 6,
    paddingHorizontal: 2,
    paddingTop: 4,
  },
  screenTitle: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '900',
  },
  screenLead: {
    color: colors.subText,
    fontSize: 14,
    lineHeight: 21,
  },
  card: {
    gap: 14,
  },
  summaryCard: {
    borderColor: colors.primaryLight,
    gap: 16,
  },
  sectionHeader: {
    gap: 4,
  },
  sectionEyebrow: {
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: '800',
  },
  planHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  planCopy: {
    flex: 1,
    gap: 4,
  },
  planBadge: {
    backgroundColor: colors.muted,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  planBadgePlus: {
    backgroundColor: colors.primaryDark,
    borderColor: colors.primaryDark,
  },
  planBadgeText: {
    color: colors.subText,
    fontSize: 12,
    fontWeight: '900',
  },
  planBadgeTextPlus: {
    color: colors.card,
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statChip: {
    backgroundColor: colors.muted,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    flexGrow: 1,
    minWidth: 112,
    padding: 12,
  },
  statLabel: {
    color: colors.subText,
    fontSize: 12,
    fontWeight: '700',
  },
  statValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
    marginTop: 4,
  },
  accountPanel: {
    alignItems: 'center',
    backgroundColor: colors.muted,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 12,
  },
  accountAvatar: {
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  accountLogoAvatar: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  accountGoogleLogo: {
    height: 20,
    width: 20,
  },
  accountAvatarText: {
    color: colors.primaryDark,
    fontSize: 16,
    fontWeight: '900',
  },
  accountBody: {
    flex: 1,
    gap: 2,
  },
  accountTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  accountMeta: {
    color: colors.subText,
    fontSize: 13,
    lineHeight: 18,
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
  },
  warningText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
  },
  planName: {
    color: colors.primaryDark,
    fontSize: 22,
    fontWeight: '900',
  },
  rowTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  rowDescription: {
    color: colors.subText,
    fontSize: 13,
    lineHeight: 19,
  },
  syncStatusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  syncBadge: {
    backgroundColor: colors.muted,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    color: colors.subText,
    fontSize: 12,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  syncBadgeActive: {
    backgroundColor: colors.successLight,
    borderColor: colors.success,
    color: colors.success,
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
  infoBox: {
    backgroundColor: colors.muted,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
    padding: 12,
  },
  infoLine: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  infoLabel: {
    color: colors.subText,
    fontSize: 13,
    lineHeight: 18,
  },
  infoValue: {
    color: colors.text,
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    textAlign: 'right',
  },
  buttonStack: {
    gap: 10,
  },
  memberList: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    gap: 10,
    marginTop: 4,
    paddingTop: 14,
  },
  memberListTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  memberRow: {
    alignItems: 'center',
    backgroundColor: colors.muted,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 58,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  memberText: {
    flex: 1,
    gap: 2,
  },
  memberRemoveButton: {
    alignItems: 'center',
    borderColor: colors.danger,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 38,
    minWidth: 56,
    paddingHorizontal: 10,
  },
  memberRemoveButtonDisabled: {
    opacity: 0.45,
  },
  memberRemoveButtonPressed: {
    backgroundColor: colors.dangerLight,
    opacity: 0.82,
  },
  memberRemoveButtonText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '800',
  },
  timeSettingRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 10,
  },
  timeInputItem: {
    flex: 1,
  },
  timeSeparator: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '900',
    paddingBottom: 12,
  },
  timeNumberInput: {
    textAlign: 'center',
  },
  saveTimeButton: {
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  joinForm: {
    gap: 12,
  },
  menuRow: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 64,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  menuRowPressed: {
    backgroundColor: colors.muted,
    transform: [{ scale: 0.99 }],
  },
  menuText: {
    flex: 1,
    gap: 3,
  },
  chevron: {
    color: colors.primaryDark,
    fontSize: 26,
    fontWeight: '500',
    lineHeight: 28,
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
  supportInput: {
    minHeight: 110,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
});

const todoItems = [
  { label: 'Google / Appleログイン', status: '任意ログインに対応済み', done: true },
  { label: 'Xログイン', status: '実装下地あり。今は非表示・未使用' },
  { label: '共有コードによるクラウド共有', status: 'Supabase参照・保存に対応済み', done: true },
  { label: 'リアルタイム同期、自動マージ', status: '初期版では未対応' },
  {
    label: 'EC API連携、商品検索',
    status: 'Supabase Edge Function経由の検索に対応済み',
    done: true,
  },
  { label: 'バーコード、OCR', status: '初期版では未対応' },
  {
    label: '多頭飼いUIの完全対応',
    status: 'プロフィール管理と在庫のペット別表示を追加済み',
    done: true,
  },
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

function formatLimit(limit: number | undefined): string {
  return limit === undefined ? '無制限' : `${limit}件まで`;
}
