import { ReactNode, useCallback, useEffect, useState } from 'react';
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
import { EmptyState } from '@/components/EmptyState';
import { InventoryCard } from '@/components/InventoryCard';
import { PetScopeSelector } from '@/components/PetScopeSelector';
import { colors } from '@/constants/colors';
import { getCurrentAuthSession, signInAsGuest } from '@/features/auth/supabaseAuth';
import { getCats } from '@/features/cats/catStorage';
import { resolveSelectedCatId, toStoredCatId } from '@/features/cats/petSelection';
import { Cat } from '@/features/cats/catTypes';
import {
  calculateRemainingDays,
  getInventoryCatIds,
  getInventoryPredictionState,
  getInventoryStatus,
  isInventoryItemForCat,
  sortInventoryItems,
} from '@/features/inventory/inventoryLogic';
import { getInventoryItems } from '@/features/inventory/inventoryStorage';
import { InventoryItem } from '@/features/inventory/inventoryTypes';
import { confirmInitialNotificationSetting } from '@/features/notifications/initialNotificationSetting';
import { scheduleInventoryNotifications } from '@/features/notifications/notificationService';
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
import appIcon from '../../assets/icon.png';

import OnboardingScreen from './OnboardingScreen';

type InventoryFilter = 'all' | 'attention' | 'watch' | 'learning' | 'disabled';
type BriefAction = Exclude<InventoryFilter, 'all'> | 'profile' | 'add';

const defaultVisibleInStockItemCount = 3;

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [cats, setCats] = useState<Cat[]>([]);
  const [selectedCatId, setSelectedCatId] = useState<string | undefined>();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [settings, setSettings] = useState<AppSettings | undefined>();
  const [hasAuthSession, setHasAuthSession] = useState<boolean | undefined>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | undefined>();
  const [inventoryFilter, setInventoryFilter] = useState<InventoryFilter>('all');
  const [showAllInStockItems, setShowAllInStockItems] = useState(false);
  const [openingInventoryForm, setOpeningInventoryForm] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoadError(undefined);
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

      const [nextCats, nextItems, settingsAlreadySaved] = await Promise.all([
        getCats(),
        getInventoryItems(),
        hasSavedSettings(),
      ]);
      const nextSettings = await confirmInitialNotificationSetting(storedSettings, {
        settingsAlreadySaved,
      });
      const selectedId = resolveSelectedCatId(nextCats, nextSettings.selectedCatId);

      setCats(nextCats);
      setSelectedCatId(selectedId);
      setItems(sortInventoryItems(nextItems));
      setSettings(nextSettings);
      await scheduleInventoryNotifications(nextItems, nextSettings);
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : '最新の在庫を読み込めませんでした。通信状況を確認してください。',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
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
    DeviceEventEmitter.emit(
      onboardingVisibilityEventName,
      Boolean(hasAuthSession && settings?.onboardingCompleted),
    );
  }, [hasAuthSession, settings]);

  const completeOnboarding = async (toProfile: boolean) => {
    const completedSettings = await updateSettings({ onboardingCompleted: true });
    await confirmInitialNotificationSetting(completedSettings, {
      onboardingJustCompleted: true,
      settingsAlreadySaved: true,
    });
    DeviceEventEmitter.emit(onboardingVisibilityEventName, true);
    setLoading(true);
    await load();
    if (toProfile) router.push('/cat-profile');
  };

  if (loadError && hasAuthSession === undefined) {
    return (
      <HomeLoadFailure
        message={loadError}
        onRetry={() => {
          setLoading(true);
          void load();
        }}
      />
    );
  }

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

  const selectedCat = cats.find((cat) => cat.id === selectedCatId);
  const catItems = selectedCatId
    ? items.filter((item) => isInventoryItemForCat(item, selectedCatId))
    : items;
  const attentionItems = catItems.filter((item) => {
    const status = getInventoryStatus(item);
    return status === 'out' || status === 'warning';
  });
  const watchItems = catItems.filter((item) => getInventoryStatus(item) === 'watch');
  const learningItems = catItems.filter((item) => getInventoryPredictionState(item) === 'learning');
  const predictionDisabledItems = catItems.filter(
    (item) => getInventoryPredictionState(item) === 'disabled',
  );
  const predictionUnavailableItems = catItems.filter(
    (item) => getInventoryPredictionState(item) === 'unavailable',
  );
  const inStockItems = catItems.filter((item) => getInventoryStatus(item) === 'in_stock');
  const visibleInStockItems = showAllInStockItems
    ? inStockItems
    : inStockItems.slice(0, defaultVisibleInStockItemCount);
  const hiddenInStockItemCount = Math.max(0, inStockItems.length - defaultVisibleInStockItemCount);
  const visibleItems =
    inventoryFilter === 'attention'
      ? attentionItems
      : inventoryFilter === 'watch'
        ? watchItems
        : inventoryFilter === 'learning'
          ? learningItems
          : inventoryFilter === 'disabled'
            ? predictionDisabledItems
            : catItems;
  const catNameById = new Map(cats.map((cat) => [cat.id, cat.name]));

  const selectCat = async (catId: string | undefined) => {
    setSelectedCatId(catId);
    setInventoryFilter('all');
    setShowAllInStockItems(false);
    await updateSettings({ selectedCatId: toStoredCatId(catId) });
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
        '先にペットプロフィールを登録してください',
        '商品はペットごとに在庫を記録します。ペットプロフィールを登録してから商品を追加できます。',
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

  const refresh = () => {
    setRefreshing(true);
    void load();
  };

  const petNamesForItem = (item: InventoryItem) =>
    getInventoryCatIds(item)
      .map((catId) => catNameById.get(catId))
      .filter((name): name is string => Boolean(name));

  const inventoryCardFor = (item: InventoryItem) => (
    <InventoryCard
      key={item.id}
      item={item}
      petNames={petNamesForItem(item)}
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
      onDetail={() => router.push({ pathname: '/inventory-detail', params: { id: item.id } })}
    />
  );

  return (
    <ScrollView
      contentContainerStyle={[styles.container, { paddingTop: Math.max(18, insets.top + 12) }]}
      refreshControl={
        <RefreshControl
          colors={[colors.primary]}
          refreshing={refreshing}
          tintColor={colors.primary}
          onRefresh={refresh}
        />
      }
    >
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.greeting}>
          在庫
        </Text>
        <Pressable
          accessibilityLabel="ペットプロフィールを管理"
          accessibilityRole="button"
          onPress={() => router.push('/cat-profile')}
          style={({ pressed }) => [styles.petManageButton, pressed && styles.pressed]}
        >
          <Text style={styles.petManageButtonLabel}>ペット</Text>
          <Text style={styles.petManageButtonArrow}>›</Text>
        </Pressable>
      </View>

      {cats.length > 0 ? (
        <PetScopeSelector
          cats={cats}
          selectedCatId={selectedCatId}
          onSelect={(catId) => void selectCat(catId)}
        />
      ) : null}

      <DailyBrief
        attentionCount={attentionItems.length}
        hasPets={cats.length > 0}
        itemCount={catItems.length}
        nextItem={catItems[0]}
        watchCount={watchItems.length}
        onAction={(action) => {
          if (action === 'profile') {
            router.push('/cat-profile');
            return;
          }
          if (action === 'add') {
            void openInventoryForm();
            return;
          }
          setInventoryFilter(action);
        }}
      />

      {loadError ? (
        <View accessibilityRole="alert" style={styles.syncNotice}>
          <Text style={styles.syncNoticeTitle}>最新情報を確認できませんでした</Text>
          <Text style={styles.syncNoticeText}>{loadError}</Text>
          <Pressable accessibilityRole="button" onPress={refresh} style={styles.retryLink}>
            <Text style={styles.retryLinkText}>もう一度読み込む</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.inventorySection}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionHeaderCopy}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>
              用品
            </Text>
            <Text style={styles.sectionMeta}>
              {selectedCat ? `${selectedCat.name}の登録用品` : '家庭の登録用品'} {catItems.length}件
            </Text>
          </View>
          {catItems.length > 0 ? (
            <Pressable
              accessibilityLabel="用品を追加"
              accessibilityRole="button"
              disabled={openingInventoryForm}
              onPress={() => void openInventoryForm()}
              style={({ pressed }) => [
                styles.addButton,
                pressed && styles.pressed,
                openingInventoryForm && styles.disabled,
              ]}
            >
              {openingInventoryForm ? (
                <ActivityIndicator color={colors.card} size="small" />
              ) : (
                <>
                  <Text style={styles.addButtonPlus}>＋</Text>
                  <Text style={styles.addButtonText}>追加</Text>
                </>
              )}
            </Pressable>
          ) : null}
        </View>

        {catItems.length > 0 ? (
          <ScrollView
            horizontal
            contentContainerStyle={styles.filterRow}
            showsHorizontalScrollIndicator={false}
          >
            <FilterChip
              count={catItems.length}
              label="すべて"
              selected={inventoryFilter === 'all'}
              onPress={() => setInventoryFilter('all')}
            />
            <FilterChip
              count={attentionItems.length}
              label="要対応"
              selected={inventoryFilter === 'attention'}
              tone="danger"
              onPress={() => setInventoryFilter('attention')}
            />
            <FilterChip
              count={watchItems.length}
              label="そろそろ"
              selected={inventoryFilter === 'watch'}
              tone="warning"
              onPress={() => setInventoryFilter('watch')}
            />
            <FilterChip
              count={learningItems.length}
              label="学習中"
              selected={inventoryFilter === 'learning'}
              onPress={() => setInventoryFilter('learning')}
            />
            <FilterChip
              count={predictionDisabledItems.length}
              label="日数表示なし"
              selected={inventoryFilter === 'disabled'}
              onPress={() => setInventoryFilter('disabled')}
            />
          </ScrollView>
        ) : null}
      </View>

      {visibleItems.length === 0 ? (
        <EmptyState
          title={
            inventoryFilter !== 'all'
              ? '条件に合う在庫はありません'
              : selectedCat
                ? `${selectedCat.name}の用品を登録しましょう`
                : 'まずは、いつものフードやトイレ用品を登録しましょう'
          }
          message={
            inventoryFilter !== 'all'
              ? '「すべて」に戻すと、登録中の用品を確認できます。'
              : '最初は「だいたい何日もつか」だけでも大丈夫です。あとから調整できます。'
          }
          actionTitle={inventoryFilter !== 'all' ? 'すべて表示' : undefined}
          onAction={inventoryFilter !== 'all' ? () => setInventoryFilter('all') : undefined}
        />
      ) : inventoryFilter !== 'all' ? (
        <View style={styles.list}>{visibleItems.map(inventoryCardFor)}</View>
      ) : (
        <View style={styles.inventoryGroups}>
          <InventoryGroup title="いま確認" items={attentionItems} renderItem={inventoryCardFor} />
          <InventoryGroup title="そろそろ" items={watchItems} renderItem={inventoryCardFor} />
          <InventoryGroup
            title="購入頻度を学習中"
            items={learningItems}
            renderItem={inventoryCardFor}
          />
          {inStockItems.length > 0 ? (
            <View style={styles.group}>
              <View style={styles.groupHeader}>
                <Text accessibilityRole="header" style={styles.groupTitle}>
                  余裕あり
                </Text>
                <Text style={styles.groupCount}>{inStockItems.length}件</Text>
              </View>
              <View style={styles.list}>{visibleInStockItems.map(inventoryCardFor)}</View>
              {hiddenInStockItemCount > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: showAllInStockItems }}
                  onPress={() => setShowAllInStockItems((current) => !current)}
                  style={({ pressed }) => [styles.expandButton, pressed && styles.pressed]}
                >
                  <Text style={styles.expandButtonText}>
                    {showAllInStockItems ? '3件だけ表示' : `残り${hiddenInStockItemCount}件を見る`}
                  </Text>
                  <Text style={styles.expandButtonArrow}>{showAllInStockItems ? '⌃' : '⌄'}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          <InventoryGroup
            title="日数表示なし"
            items={predictionDisabledItems}
            renderItem={inventoryCardFor}
          />
          <InventoryGroup
            title="予測情報なし"
            items={predictionUnavailableItems}
            renderItem={inventoryCardFor}
          />
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

function HomeLoadFailure({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.loadingScreen}>
      <View style={styles.loadErrorMark}>
        <Text style={styles.loadErrorMarkText}>!</Text>
      </View>
      <Text accessibilityRole="header" style={styles.loadingTitle}>
        在庫を読み込めませんでした
      </Text>
      <Text style={styles.loadErrorText}>{message}</Text>
      <AppButton title="もう一度試す" onPress={onRetry} style={styles.retryButton} />
    </View>
  );
}

function FilterChip({
  label,
  count,
  selected,
  tone = 'normal',
  onPress,
}: {
  label: string;
  count: number;
  selected: boolean;
  tone?: 'normal' | 'danger' | 'warning';
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.filterChip,
        selected && styles.filterChipSelected,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.filterChipText, selected && styles.filterChipTextSelected]}>
        {selected ? '✓ ' : ''}
        {label}
      </Text>
      <View
        style={[
          styles.filterCount,
          tone === 'danger' && styles.filterCountDanger,
          tone === 'warning' && styles.filterCountWarning,
          selected && styles.filterCountSelected,
        ]}
      >
        <Text
          style={[
            styles.filterCountText,
            tone === 'danger' && styles.filterCountDangerText,
            tone === 'warning' && styles.filterCountWarningText,
            selected && styles.filterCountTextSelected,
          ]}
        >
          {count}
        </Text>
      </View>
    </Pressable>
  );
}

function DailyBrief({
  hasPets,
  itemCount,
  attentionCount,
  watchCount,
  nextItem,
  onAction,
}: {
  hasPets: boolean;
  itemCount: number;
  attentionCount: number;
  watchCount: number;
  nextItem?: InventoryItem;
  onAction: (action: BriefAction) => void;
}) {
  let eyebrow = '今日の確認';
  let title = '今日は対応なし';
  let message = '急いで買い足す用品はありません。';
  let mark = '✓';
  let tone: 'good' | 'warning' | 'danger' | 'neutral' = 'good';
  let action: BriefAction | undefined;
  let actionTitle: string | undefined;

  if (!hasPets) {
    eyebrow = '最初のステップ';
    title = 'まず、ペットを登録しましょう';
    message = '名前だけで始められます。誕生日や体重はあとから追加できます。';
    mark = '1';
    tone = 'neutral';
    action = 'profile';
    actionTitle = 'ペットを登録する';
  } else if (itemCount === 0) {
    eyebrow = 'あと1ステップ';
    title = 'いつもの用品を1つ登録';
    message = 'フードやトイレ用品の残り日数が分かるようになります。';
    mark = '＋';
    tone = 'neutral';
    action = 'add';
    actionTitle = '最初の用品を追加';
  } else if (attentionCount > 0) {
    eyebrow = 'いま確認';
    title = `買い足しを確認したい用品が${attentionCount}件`;
    message = '在庫切れと残り3日以内の用品を、期限が近い順にまとめました。';
    mark = '!';
    tone = 'danger';
    action = 'attention';
    actionTitle = '要対応の用品を見る';
  } else if (watchCount > 0) {
    eyebrow = '今週の準備';
    title = `そろそろ確認したい用品が${watchCount}件`;
    message = '残り4〜7日の用品です。次の買い物に入れておくと安心です。';
    mark = '7';
    tone = 'warning';
    action = 'watch';
    actionTitle = 'そろそろの用品を見る';
  } else if (nextItem) {
    const nextDays = calculateRemainingDays(nextItem);
    message =
      nextDays === undefined
        ? '急いで買い足す用品はありません。'
        : `次は「${nextItem.name}」が約${Math.max(0, nextDays)}日後の予定です。`;
  }

  return (
    <View
      accessibilityLabel={`${eyebrow}。${title}。${message}`}
      style={[
        styles.brief,
        tone === 'danger' && styles.briefDanger,
        tone === 'warning' && styles.briefWarning,
        tone === 'neutral' && styles.briefNeutral,
      ]}
    >
      <View style={styles.briefTop}>
        <View
          style={[
            styles.briefMark,
            tone === 'danger' && styles.briefMarkDanger,
            tone === 'warning' && styles.briefMarkWarning,
            tone === 'neutral' && styles.briefMarkNeutral,
          ]}
        >
          <Text style={styles.briefMarkText}>{mark}</Text>
        </View>
        <Text style={styles.briefEyebrow}>{eyebrow}</Text>
      </View>
      <Text accessibilityRole="header" style={styles.briefTitle}>
        {title}
      </Text>
      <Text style={styles.briefMessage}>{message}</Text>
      {action && actionTitle ? (
        <AppButton
          title={actionTitle}
          onPress={() => onAction(action)}
          style={styles.briefAction}
        />
      ) : null}
    </View>
  );
}

function InventoryGroup({
  title,
  items,
  renderItem,
}: {
  title: string;
  items: InventoryItem[];
  renderItem: (item: InventoryItem) => ReactNode;
}) {
  if (items.length === 0) return null;

  return (
    <View style={styles.group}>
      <View style={styles.groupHeader}>
        <Text accessibilityRole="header" style={styles.groupTitle}>
          {title}
        </Text>
        <Text style={styles.groupCount}>{items.length}件</Text>
      </View>
      <View style={styles.list}>{items.map(renderItem)}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'center',
    gap: 24,
    maxWidth: 720,
    paddingBottom: 48,
    paddingHorizontal: 20,
    width: '100%',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  greeting: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
    lineHeight: 36,
  },
  petManageButton: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 44,
    paddingHorizontal: 14,
  },
  petManageButtonLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  petManageButtonArrow: {
    color: colors.primary,
    fontSize: 22,
    lineHeight: 24,
    marginLeft: 4,
  },
  brief: {
    backgroundColor: colors.successLight,
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1,
    gap: 9,
    overflow: 'hidden',
    padding: 20,
  },
  briefDanger: {
    backgroundColor: colors.dangerLight,
  },
  briefWarning: {
    backgroundColor: colors.warningLight,
  },
  briefNeutral: {
    backgroundColor: colors.primaryLight,
  },
  briefTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  briefMark: {
    alignItems: 'center',
    backgroundColor: colors.success,
    borderRadius: 999,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  briefMarkDanger: {
    backgroundColor: colors.danger,
  },
  briefMarkWarning: {
    backgroundColor: colors.warning,
  },
  briefMarkNeutral: {
    backgroundColor: colors.primary,
  },
  briefMarkText: {
    color: colors.card,
    fontSize: 14,
    fontWeight: '900',
  },
  briefEyebrow: {
    color: colors.subText,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  briefTitle: {
    color: colors.text,
    fontSize: 23,
    fontWeight: '800',
    letterSpacing: -0.3,
    lineHeight: 31,
  },
  briefMessage: {
    color: colors.subText,
    fontSize: 15,
    lineHeight: 23,
  },
  briefAction: {
    marginTop: 7,
  },
  syncNotice: {
    backgroundColor: colors.muted,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    gap: 4,
    padding: 14,
  },
  syncNoticeTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  syncNoticeText: {
    color: colors.subText,
    fontSize: 13,
    lineHeight: 19,
  },
  retryLink: {
    alignSelf: 'flex-start',
    justifyContent: 'center',
    minHeight: 44,
  },
  retryLinkText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '800',
    textDecorationLine: 'underline',
  },
  inventorySection: {
    gap: 12,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  sectionHeaderCopy: {
    flex: 1,
    gap: 2,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 28,
  },
  sectionMeta: {
    color: colors.subText,
    fontSize: 13,
    lineHeight: 19,
  },
  addButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 999,
    flexDirection: 'row',
    gap: 3,
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 86,
    paddingHorizontal: 14,
  },
  addButtonPlus: {
    color: colors.card,
    fontSize: 20,
    fontWeight: '500',
    lineHeight: 22,
  },
  addButtonText: {
    color: colors.card,
    fontSize: 14,
    fontWeight: '800',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 20,
  },
  filterChip: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    minHeight: 44,
    paddingHorizontal: 13,
  },
  filterChipSelected: {
    backgroundColor: colors.text,
    borderColor: colors.text,
  },
  filterChipText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  filterChipTextSelected: {
    color: colors.card,
  },
  filterCount: {
    alignItems: 'center',
    backgroundColor: colors.muted,
    borderRadius: 999,
    justifyContent: 'center',
    minHeight: 24,
    minWidth: 24,
    paddingHorizontal: 7,
  },
  filterCountDanger: {
    backgroundColor: colors.dangerLight,
  },
  filterCountWarning: {
    backgroundColor: colors.warningLight,
  },
  filterCountSelected: {
    backgroundColor: colors.card,
  },
  filterCountText: {
    color: colors.subText,
    fontSize: 12,
    fontWeight: '800',
  },
  filterCountDangerText: {
    color: colors.danger,
  },
  filterCountWarningText: {
    color: colors.warning,
  },
  filterCountTextSelected: {
    color: colors.text,
  },
  inventoryGroups: {
    gap: 24,
  },
  group: {
    gap: 10,
  },
  groupHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  groupTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  groupCount: {
    color: colors.subText,
    fontSize: 13,
    fontWeight: '600',
  },
  list: {
    gap: 12,
  },
  expandButton: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 16,
  },
  expandButtonText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  expandButtonArrow: {
    color: colors.primary,
    fontSize: 16,
    marginLeft: 8,
  },
  pressed: {
    opacity: 0.72,
  },
  disabled: {
    opacity: 0.45,
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
    fontWeight: '800',
    marginTop: 4,
  },
  loadingText: {
    color: colors.subText,
    fontSize: 13,
    marginBottom: 4,
  },
  loadErrorMark: {
    alignItems: 'center',
    backgroundColor: colors.dangerLight,
    borderRadius: 999,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  loadErrorMarkText: {
    color: colors.danger,
    fontSize: 28,
    fontWeight: '900',
  },
  loadErrorText: {
    color: colors.subText,
    fontSize: 14,
    lineHeight: 21,
    maxWidth: 420,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 8,
    minWidth: 180,
  },
});
