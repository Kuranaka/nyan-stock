import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/AppButton';
import { AppCard } from '@/components/AppCard';
import { EmptyState } from '@/components/EmptyState';
import { InventoryCard } from '@/components/InventoryCard';
import { colors } from '@/constants/colors';
import { signInAsGuest } from '@/features/auth/supabaseAuth';
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
import { scheduleInventoryNotifications } from '@/features/notifications/notificationService';
import { getSettings, updateSettings } from '@/features/settings/settingsStorage';
import { AppSettings } from '@/features/settings/settingsTypes';
import { useHouseholdSyncEvents } from '@/features/sync/useHouseholdSyncEvents';
import { formatTodayJapanese } from '@/utils/date';

import OnboardingScreen from './OnboardingScreen';

type InventoryFilter = 'out' | 'warning' | 'watch';

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [cats, setCats] = useState<Cat[]>([]);
  const [selectedCatId, setSelectedCatId] = useState<string | undefined>();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [settings, setSettings] = useState<AppSettings | undefined>();
  const [loading, setLoading] = useState(true);
  const [inventoryFilter, setInventoryFilter] = useState<InventoryFilter | undefined>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextCat, nextItems, nextSettings] = await Promise.all([
        getCats(),
        getInventoryItems(),
        getSettings(),
      ]);
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
      void load();
    }, [load]),
  );
  useHouseholdSyncEvents(() => {
    void load();
  });

  const completeOnboarding = async (toProfile: boolean) => {
    await updateSettings({ onboardingCompleted: true });
    await load();
    if (toProfile) router.push('/cat-profile');
  };

  const startAsGuest = async () => {
    await signInAsGuest();
    await completeOnboarding(true);
  };

  if (settings && !settings.onboardingCompleted) {
    return (
      <OnboardingScreen
        onStart={startAsGuest}
        onSignedIn={() => void completeOnboarding(true)}
      />
    );
  }

  if (!settings) {
    return <HomeLoading />;
  }

  const selectedCat = cats.find((nextCat) => nextCat.id === selectedCatId);
  const catItems = selectedCatId ? items.filter((item) => isInventoryItemForCat(item, selectedCatId)) : items;
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

  const openInventoryForm = () => {
    if (cats.length > 0) {
      router.push('/inventory-form');
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
  };

  return (
    <ScrollView
      contentContainerStyle={[styles.container, { paddingTop: Math.max(18, insets.top + 12) }]}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{selectedCat ? `${selectedCat.name}の在庫` : '猫用品の在庫'}</Text>
          <Text style={styles.date}>{formatTodayJapanese()}</Text>
        </View>
        <AppButton title="設定" variant="secondary" onPress={() => router.push('/settings')} />
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
        <AppButton
          title="猫管理"
          variant="secondary"
          onPress={() => router.push('/cat-profile')}
          style={[styles.catTab, styles.catManageTab]}
        />
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
        <AppButton title="商品を追加する" onPress={openInventoryForm} />
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
          message={inventoryFilter ? '在庫状況の項目をもう一度押すと絞り込みを解除できます。' : '登録すると、残り何日でなくなるか自動で分かります'}
          actionTitle={inventoryFilter ? undefined : '商品を追加する'}
          onAction={inventoryFilter ? undefined : openInventoryForm}
        />
      ) : (
        <View style={styles.list}>
          {visibleItems.map((item) => (
            <InventoryCard
              key={item.id}
              item={item}
              onPurchase={() => router.push({ pathname: '/inventory-detail', params: { id: item.id, action: 'purchase' } })}
              onReplenish={() => router.push({ pathname: '/inventory-detail', params: { id: item.id, action: 'replenish' } })}
              onDetail={() => router.push({ pathname: '/inventory-detail', params: { id: item.id } })}
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
        <Text style={styles.loadingMarkText}>に</Text>
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
      {cat.iconUrl ? <Image source={{ uri: cat.iconUrl }} style={styles.catTabIcon} resizeMode="cover" /> : null}
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
      style={({ pressed }) => [styles.summaryItem, selected && styles.summaryItemSelected, pressed && styles.summaryItemPressed]}
    >
      <Text style={[styles.summaryValue, tone === 'danger' && styles.danger, tone === 'warning' && styles.warning]}>
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
  catManageTab: {
    backgroundColor: colors.accent,
    borderColor: colors.primaryDark,
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
    backgroundColor: colors.primary,
    borderRadius: 20,
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  loadingMarkText: {
    color: colors.card,
    fontSize: 30,
    fontWeight: '900',
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
