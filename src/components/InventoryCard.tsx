import { StyleSheet, Text, View } from 'react-native';

import { categoryLabels } from '@/constants/categories';
import { colors } from '@/constants/colors';
import {
  calculateRemainingDays,
  calculateRemainingPercent,
  getInventoryStatus,
} from '@/features/inventory/inventoryLogic';
import { InventoryItem } from '@/features/inventory/inventoryTypes';

import { AppButton } from './AppButton';
import { AppCard } from './AppCard';
import { StatusBadge } from './StatusBadge';

type Props = {
  item: InventoryItem;
  onPurchase: () => void;
  onReplenish: () => void;
  onDetail: () => void;
};

export function InventoryCard({ item, onPurchase, onReplenish, onDetail }: Props) {
  const remainingDays = calculateRemainingDays(item);
  const percent = calculateRemainingPercent(item);
  const status = getInventoryStatus(item);

  return (
    <AppCard style={styles.card}>
      <View style={styles.header}>
        <View style={styles.titleWrap}>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.category}>{categoryLabels[item.category]}</Text>
        </View>
        <StatusBadge status={status} />
      </View>

      <View style={styles.metrics}>
        <View>
          <Text style={styles.metricLabel}>残り日数</Text>
          <Text style={styles.metricValue}>
            {remainingDays === undefined ? '未計算' : `${Math.max(0, remainingDays)}日`}
          </Text>
        </View>
        <View>
          <Text style={styles.metricLabel}>残量</Text>
          <Text style={styles.metricValue}>{percent === undefined ? '--%' : `${percent}%`}</Text>
        </View>
      </View>

      <View style={styles.progressTrack}>
        <View style={[styles.progressBar, { width: `${percent ?? 0}%` }]} />
      </View>

      <Text style={styles.affiliate}>商品リンクにはアフィリエイトリンクが含まれる場合があります。</Text>

      <View style={styles.actions}>
        <AppButton title="購入する" onPress={onPurchase} style={styles.action} />
        <AppButton title="補充した" variant="secondary" onPress={onReplenish} style={styles.action} />
        <AppButton title="詳細" variant="ghost" onPress={onDetail} style={styles.action} />
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 14,
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  titleWrap: {
    flex: 1,
    gap: 5,
  },
  name: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  category: {
    color: colors.subText,
    fontSize: 14,
  },
  metrics: {
    flexDirection: 'row',
    gap: 28,
  },
  metricLabel: {
    color: colors.subText,
    fontSize: 13,
  },
  metricValue: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
  },
  progressTrack: {
    height: 9,
    borderRadius: 999,
    backgroundColor: colors.muted,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: colors.primary,
  },
  affiliate: {
    color: colors.subText,
    fontSize: 11,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  action: {
    flexGrow: 1,
    minWidth: 96,
  },
});
