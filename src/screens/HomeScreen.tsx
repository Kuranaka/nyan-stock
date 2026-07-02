import { useCallback, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { AppButton } from '@/components/AppButton';
import { AppCard } from '@/components/AppCard';
import { EmptyState } from '@/components/EmptyState';
import { InventoryCard } from '@/components/InventoryCard';
import { colors } from '@/constants/colors';
import { getPrimaryCat } from '@/features/cats/catStorage';
import { Cat } from '@/features/cats/catTypes';
import {
  calculateRemainingDays,
  getInventoryStatus,
  sortInventoryItems,
} from '@/features/inventory/inventoryLogic';
import { getInventoryItems, replenishInventoryItem } from '@/features/inventory/inventoryStorage';
import { InventoryItem, PurchaseHistory } from '@/features/inventory/inventoryTypes';
import { openPurchaseUrl } from '@/features/inventory/purchaseLink';
import { scheduleInventoryNotifications } from '@/features/notifications/notificationService';
import { getSettings, updateSettings } from '@/features/settings/settingsStorage';
import { AppSettings } from '@/features/settings/settingsTypes';
import { formatTodayJapanese, nowIso, todayIso } from '@/utils/date';
import { createId } from '@/utils/validation';

import OnboardingScreen from './OnboardingScreen';

export default function HomeScreen() {
  const router = useRouter();
  const [cat, setCat] = useState<Cat | undefined>();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [settings, setSettings] = useState<AppSettings | undefined>();
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextCat, nextItems, nextSettings] = await Promise.all([
        getPrimaryCat(),
        getInventoryItems(),
        getSettings(),
      ]);
      setCat(nextCat);
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

  const completeOnboarding = async (toProfile: boolean) => {
    await updateSettings({ onboardingCompleted: true });
    await load();
    if (toProfile) router.push('/cat-profile');
  };

  if (settings && !settings.onboardingCompleted) {
    return (
      <OnboardingScreen
        onStart={() => void completeOnboarding(true)}
        onSkip={() => void completeOnboarding(false)}
      />
    );
  }

  const outCount = items.filter((item) => getInventoryStatus(item) === 'out').length;
  const warningCount = items.filter((item) => {
    const days = calculateRemainingDays(item);
    return days !== undefined && days > 0 && days <= 3;
  }).length;
  const watchCount = items.filter((item) => {
    const days = calculateRemainingDays(item);
    return days !== undefined && days > 3 && days <= 7;
  }).length;

  const replenishQuick = (item: InventoryItem) => {
    Alert.alert('在庫を補充しましたか？', `${item.name}を今日の日付で補充します。`, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '補充する',
        onPress: async () => {
          const history: PurchaseHistory = {
            id: createId('history'),
            inventoryItemId: item.id,
            purchasedAt: todayIso(),
            amount: item.amount,
            unit: item.unit,
            createdAt: nowIso(),
          };
          await replenishInventoryItem(item, history, true);
          await load();
        },
      },
    ]);
  };

  const purchase = async (item: InventoryItem) => {
    const shop = item.purchaseLinks.amazon
      ? 'amazon'
      : item.purchaseLinks.rakuten
        ? 'rakuten'
        : item.purchaseLinks.yahoo
          ? 'yahoo'
          : item.purchaseLinks.other
            ? 'other'
            : undefined;
    if (!shop) {
      Alert.alert('購入URLが未登録です', '商品詳細または編集画面からURLを登録できます。');
      return;
    }
    await openPurchaseUrl(item, shop);
  };

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{cat ? `${cat.name}の在庫` : '猫用品の在庫'}</Text>
          <Text style={styles.date}>{formatTodayJapanese()}</Text>
        </View>
        <AppButton title="設定" variant="secondary" onPress={() => router.push('/settings')} />
      </View>

      <AppCard>
        <Text style={styles.sectionTitle}>在庫状況</Text>
        <View style={styles.summaryRow}>
          <Summary value={outCount} label="在庫切れ" tone="danger" />
          <Summary value={warningCount} label="残り3日以内" tone="warning" />
          <Summary value={watchCount} label="残り7日以内" tone="normal" />
        </View>
      </AppCard>

      <View style={styles.actions}>
        <AppButton title="商品を追加する" onPress={() => router.push('/inventory-form')} />
        <AppButton
          title="購入履歴"
          variant="secondary"
          onPress={() => router.push('/purchase-history')}
        />
      </View>

      {items.length === 0 ? (
        <EmptyState
          title="まずは、いつものフードや猫砂を登録しましょう"
          message="登録すると、残り何日でなくなるか自動で分かります"
          actionTitle="商品を追加する"
          onAction={() => router.push('/inventory-form')}
        />
      ) : (
        <View style={styles.list}>
          {items.map((item) => (
            <InventoryCard
              key={item.id}
              item={item}
              onPurchase={() => void purchase(item)}
              onReplenish={() => replenishQuick(item)}
              onDetail={() => router.push({ pathname: '/inventory-detail', params: { id: item.id } })}
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function Summary({ value, label, tone }: { value: number; label: string; tone: string }) {
  return (
    <View style={styles.summaryItem}>
      <Text style={[styles.summaryValue, tone === 'danger' && styles.danger, tone === 'warning' && styles.warning]}>
        {value}
      </Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
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
    borderRadius: 14,
    padding: 12,
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
});
