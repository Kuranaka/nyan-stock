import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  DeviceEventEmitter,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/AppButton';
import { AppCard } from '@/components/AppCard';
import { EmptyState } from '@/components/EmptyState';
import { InventoryCard } from '@/components/InventoryCard';
import { colors } from '@/constants/colors';
import { getCurrentAuthSession, signInAsGuest } from '@/features/auth/supabaseAuth';
import { getCats } from '@/features/cats/catStorage';
import { Cat } from '@/features/cats/catTypes';
import {
  calculateRemainingDays,
  getInventoryStatus,
  isInventoryItemForCat,
  sortInventoryItems,
} from '@/features/inventory/inventoryLogic';
import { getInventoryItems } from '@/features/inventory/inventoryStorage';
import { InventoryItem } from '@/features/inventory/inventoryTypes';
import {
  requestNotificationPermission,
  scheduleInventoryNotifications,
} from '@/features/notifications/notificationService';
import {
  getSettings,
  hasSavedSettings,
  onboardingVisibilityEventName,
  updateSettings,
} from '@/features/settings/settingsStorage';
import { AppSettings } from '@/features/settings/settingsTypes';
import {
  canCreateInventoryItem,
  freePlanInventoryLimit,
  getSubscriptionEntitlement,
} from '@/features/subscription/subscriptionService';
import { useHouseholdSyncEvents } from '@/features/sync/useHouseholdSyncEvents';
import { formatTodayJapanese } from '@/utils/date';
import appIcon from '../../assets/icon.png';

import OnboardingScreen from './OnboardingScreen';

type InventoryFilter = 'out' | 'warning' | 'watch';

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [cats, setCats] = useState<Cat[]>([]);
  const [selectedCatId, setSelectedCatId] = useState<string | undefined>();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [settings, setSettings] = useState<AppSettings | undefined>();
  const [hasAuthSession, setHasAuthSession] = useState<boolean | undefined>();
  const [loading, setLoading] = useState(true);
  const [inventoryFilter, setInventoryFilter] = useState<InventoryFilter | undefined>();
  const [openingInventoryForm, setOpeningInventoryForm] = useState(false);

  const confirmInitialNotificationSetting = async (
    currentSettings: AppSettings,
    settingsAlreadySaved: boolean,
  ): Promise<AppSettings> => {
    if (currentSettings.notificationPermissionPrompted || settingsAlreadySaved) return currentSettings;

    const notificationsEnabled = await requestNotificationPermission();
    return updateSettings({
      notificationPermissionPrompted: true,
      notificationsEnabled,
    });
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [storedSettings, authSession] = await Promise.all([
        getSettings(),
        getCurrentAuthSession(),
      ]);
      const isSignedIn = Boolean(authSession);
      setHasAuthSession(isSignedIn);
      setSettings(storedSettings);

      if (!isSignedIn) {
        setCats([]);
        setItems([]);
        setSelectedCatId(undefined);
        return;
      }

      const [nextCat, nextItems, settingsAlreadySaved] = await Promise.all([
        getCats(),
        getInventoryItems(),
        hasSavedSettings(),
      ]);
      const nextSettings = await confirmInitialNotificationSetting(storedSettings, settingsAlreadySaved);
      const selectedId = nextCat.some((cat) => cat.id === nextSettings.selectedCatId)
        ? nextSettings.selectedCatId
        : nextCat[0]?.id;
      setCats(nextCat);
      setSelectedCatId(selectedId);
      setItems(sortInventoryItems(nextItems));
      setSettings(nextSettings);
      await scheduleInventoryNotifications(nextItems, nextSettings);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setOpeningInventoryForm(false);
      void load();
    }, [load]),
  );
  useHouseholdSyncEvents(() => {
    void load();
  });

  useEffect(() => {
    if (settings) {
      DeviceEventEmitter.emit(onboardingVisibilityEventName, settings.onboardingCompleted);
    }
  }, [settings]);

  const completeOnboarding = async (toProfile: boolean) => {
    await updateSettings({ onboardingCompleted: true });
    DeviceEventEmitter.emit(onboardingVisibilityEventName, true);
    await load();
    if (toProfile) router.push('/cat-profile');
  };

  if (loading || hasAuthSession === undefined) {
    return <HomeLoading />;
  }

  const startAsGuest = async () => {
    await signInAsGuest();
    await completeOnboarding(true);
  };

  if (!hasAuthSession || (settings && !settings.onboardingCompleted)) {
    return (
      <OnboardingScreen onStart={startAsGuest} onSignedIn={() => void completeOnboarding(true)} />
    );
  }

  if (!settings) {
    return <HomeLoading />;
  }

  const selectedCat = cats.find((nextCat) => nextCat.id === selectedCatId);
  const catItems = selectedCatId
    ? items.filter((item) => isInventoryItemForCat(item, selectedCatId))
    : items;
  const outItems = catItems.filter((item) => getInventoryStatus(item) === 'out');
  const warningItems = catItems.filter((item) => {
    const days = calculateRemainingDays(item);
    return days !== undefined && days > 0 && days <= 3;
  });
  const watchItems = catItems.filter((item) => {
    const days = calculateRemainingDays(item);
    return days !== undefined && days > 3 && days <= 7;
  });
  const visibleItems =
    inventoryFilter === 'out'
      ? outItems
      : inventoryFilter === 'warning'
        ? warningItems
        : inventoryFilter === 'watch'
          ? watchItems
          : catItems;

  const selectCat = async (catId: string) => {
    setSelectedCatId(catId);
    setInventoryFilter(undefined);
    await updateSettings({ selectedCatId: catId });
  };

  const toggleInventoryFilter = (nextFilter: InventoryFilter) => {
    setInventoryFilter((currentFilter) => (currentFilter === nextFilter ? undefined : nextFilter));
  };

  const openInventoryForm = async () => {
    if (openingInventoryForm) return;
    setOpeningInventoryForm(true);
    let didNavigate = false;
    try {
      if (cats.length > 0) {
        const entitlement = await getSubscriptionEntitlement();
        if (!canCreateInventoryItem(entitlement, items.length)) {
          Alert.alert(
            `無料プランでは在庫は${freePlanInventoryLimit}件までです`,
            'Plusにすると、在庫を無制限に登録でき、広告も非表示になります。',
            [
              { text: 'あとで', style: 'cancel' },
              { text: 'Plusを見る', onPress: () => router.push('/subscription') },
            ],
          );
          return;
        }
        router.push('/inventory-form');
        didNavigate = true;
        return;
      }
      Alert.alert(
        '先に猫プロフィールを登録してください',
        '商品は猫ごとに在庫を記録します。猫プロフィールを登録してから商品を追加できます。',
        [
          { text: 'キャンセル', style: 'cancel' },
          { text: '登録する', onPress: () => router.push('/cat-profile') },
        ],
      );
    } catch (error) {
      Alert.alert(
        '商品登録を開けませんでした',
        error instanceof Error ? error.message : '時間をおいてもう一度お試しください。',
      );
    } finally {
      if (!didNavigate) setOpeningInventoryForm(false);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={[styles.container, { paddingTop: Math.max(18, insets.top + 12) }]}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>
            {selectedCat ? `${selectedCat.name}の在庫` : '猫用品の在庫'}
          </Text>
          <Text style={styles.date}>{formatTodayJapanese()}</Text>
        </View>
        <AppButton title="設定" variant="secondary" onPress={() => router.push('/settings')} />
      </View>

      <View style={styles.catSection}>
        <View style={styles.catSectionHeader}>
          <Text style={styles.catSectionTitle}>猫を選択</Text>
          <Pressable
            accessibilityLabel="猫を追加・編集する"
            accessibilityRole="button"
            onPress={() => router.push('/cat-profile')}
            style={({ pressed }) => [styles.catManageLink, pressed && styles.catManageLinkPressed]}
          >
            <Text style={styles.catManageLinkText}>猫を管理</Text>
            <Text style={styles.catManageLinkArrow}>›</Text>
          </Pressable>
        </View>
        <View style={styles.catTabs}>
          {cats.map((nextCat) => (
            <CatTab
              key={nextCat.id}
              cat={nextCat}
              selected={nextCat.id === selectedCatId}
              onPress={() => void selectCat(nextCat.id)}
            />
          ))}
        </View>
      </View>

      <AppCard>
        <Text style={styles.sectionTitle}>在庫状況</Text>
        <View style={styles.summaryRow}>
          <Summary
            value={outItems.length}
            label="在庫切れ"
            tone="danger"
            selected={inventoryFilter === 'out'}
            onPress={() => toggleInventoryFilter('out')}
          />
          <Summary
            value={warningItems.length}
            label="残り3日以内"
            tone="warning"
            selected={inventoryFilter === 'warning'}
            onPress={() => toggleInventoryFilter('warning')}
          />
          <Summary
            value={watchItems.length}
            label="残り7日以内"
            tone="normal"
            selected={inventoryFilter === 'watch'}
            onPress={() => toggleInventoryFilter('watch')}
          />
        </View>
      </AppCard>

      <View style={styles.actions}>
        <AppButton
          title="商品を追加する"
          onPress={() => void openInventoryForm()}
          disabled={openingInventoryForm}
          loading={openingInventoryForm}
        />
        <AppButton
          title="費用を見る"
          variant="secondary"
          onPress={() => router.push('/cost-dashboard')}
        />
      </View>

      {visibleItems.length === 0 ? (
        <EmptyState
          title={
            inventoryFilter
              ? '条件に合う在庫はありません'
              : selectedCat
                ? `${selectedCat.name}の用品を登録しましょう`
                : 'まずは、いつものフードや猫砂を登録しましょう'
          }
          message={
            inventoryFilter
              ? '在庫状況の項目をもう一度押すと絞り込みを解除できます。'
              : '登録すると、残り何日でなくなるか自動で分かります'
          }
          actionTitle={inventoryFilter ? undefined : '商品を追加する'}
          onAction={inventoryFilter ? undefined : () => void openInventoryForm()}
          actionDisabled={openingInventoryForm}
          actionLoading={openingInventoryForm}
        />
      ) : (
        <View style={styles.list}>
          {visibleItems.map((item) => (
            <InventoryCard
              key={item.id}
              item={item}
              onPurchase={() =>
                router.push({
                  pathname: '/inventory-detail',
                  params: { id: item.id, action: 'purchase' },
                })
              }
              onReplenish={() =>
                router.push({
                  pathname: '/inventory-detail',
                  params: { id: item.id, action: 'replenish' },
                })
              }
              onDetail={() =>
                router.push({ pathname: '/inventory-detail', params: { id: item.id } })
              }
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function HomeLoading() {
  return (
    <View style={styles.loadingScreen}>
      <View style={styles.loadingMark}>
        <Image accessibilityIgnoresInvertColors source={appIcon} style={styles.loadingIcon} />
      </View>
      <Text style={styles.loadingTitle}>にゃんストック</Text>
      <Text style={styles.loadingText}>在庫を読み込んでいます...</Text>
      <ActivityIndicator color={colors.primaryDark} size="small" />
    </View>
  );
}

function CatTab({ cat, selected, onPress }: { cat: Cat; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.catTab,
        selected ? styles.catTabSelected : styles.catTabSecondary,
        pressed && styles.catTabPressed,
      ]}
    >
      {cat.iconUrl ? (
        <Image source={{ uri: cat.iconUrl }} style={styles.catTabIcon} resizeMode="cover" />
      ) : null}
      <Text style={[styles.catTabText, selected && styles.catTabTextSelected]} numberOfLines={1}>
        {cat.name}
      </Text>
    </Pressable>
  );
}

function Summary({
  value,
  label,
  tone,
  selected,
  onPress,
}: {
  value: number;
  label: string;
  tone: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.summaryItem,
        selected && styles.summaryItemSelected,
        pressed && styles.summaryItemPressed,
      ]}
    >
      <Text
        style={[
          styles.summaryValue,
          tone === 'danger' && styles.danger,
          tone === 'warning' && styles.warning,
        ]}
      >
        {value}
      </Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 18,
    padding: 18,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  greeting: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '900',
  },
  date: {
    color: colors.subText,
    fontSize: 14,
    marginTop: 4,
  },
  catTabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  catSection: {
    gap: 8,
  },
  catSectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  catSectionTitle: {
    color: colors.subText,
    fontSize: 13,
    fontWeight: '800',
  },
  catTab: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    minHeight: 56,
    minWidth: 92,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  catTabSecondary: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.border,
  },
  catTabSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  catTabPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.98 }],
  },
  catTabIcon: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    height: 36,
    width: 36,
  },
  catTabText: {
    color: colors.text,
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '800',
  },
  catTabTextSelected: {
    color: colors.card,
  },
  catManageLink: {
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 3,
    minHeight: 44,
    paddingHorizontal: 12,
  },
  catManageLinkPressed: {
    opacity: 0.65,
  },
  catManageLinkText: {
    color: colors.primaryDark,
    fontSize: 14,
    fontWeight: '800',
  },
  catManageLinkArrow: {
    color: colors.primaryDark,
    fontSize: 23,
    fontWeight: '400',
    lineHeight: 24,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 10,
  },
  summaryItem: {
    flex: 1,
    backgroundColor: colors.muted,
    borderColor: 'transparent',
    borderWidth: 2,
    borderRadius: 14,
    padding: 12,
  },
  summaryItemPressed: {
    opacity: 0.82,
  },
  summaryItemSelected: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  summaryValue: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '900',
  },
  summaryLabel: {
    color: colors.subText,
    fontSize: 12,
    marginTop: 4,
  },
  danger: {
    color: colors.danger,
  },
  warning: {
    color: colors.warning,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  list: {
    gap: 14,
  },
  loadingScreen: {
    alignItems: 'center',
    backgroundColor: colors.background,
    flex: 1,
    gap: 10,
    justifyContent: 'center',
    padding: 24,
  },
  loadingMark: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    height: 64,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    width: 64,
  },
  loadingIcon: {
    borderRadius: 16,
    height: 52,
    width: 52,
  },
  loadingTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '900',
    marginTop: 4,
  },
  loadingText: {
    color: colors.subText,
    fontSize: 13,
    marginBottom: 4,
  },
});
