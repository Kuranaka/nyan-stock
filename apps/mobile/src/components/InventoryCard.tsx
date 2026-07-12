import { Image, StyleSheet, Text, View } from 'react-native';

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
  const progressPercent = Math.max(0, Math.min(100, percent ?? 0));

  return (
    <AppCard style={styles.card}>
      <View style={styles.header}>
        {item.imageUrl ? (
          <Image source={{ uri: item.imageUrl }} style={styles.thumbnail} resizeMode="contain" />
        ) : null}
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
            {item.estimationMode === 'no_estimate'
              ? '計算しない'
              : remainingDays === undefined
                ? '未計算'
                : `${Math.max(0, remainingDays)}日`}
          </Text>
        </View>
        <View>
          <Text style={styles.metricLabel}>残量</Text>
          <Text style={styles.metricValue}>{percent === undefined ? '--%' : `${percent}%`}</Text>
        </View>
      </View>

      {item.estimationMode !== 'no_estimate' ? (
        <View style={styles.progressTrack}>
          <View style={[styles.progressBar, { width: `${progressPercent}%` }]} />
        </View>
      ) : null}

      <View style={styles.actions}>
        <AppButton title="購入する" onPress={onPurchase} style={styles.action} />
        <AppButton title="補充した" variant="secondary" onPress={onReplenish} style={styles.action} />
        <AppButton title="詳細" variant="ghost" onPress={onDetail} style={[styles.action, styles.detailAction]} />
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
  thumbnail: {
    backgroundColor: colors.muted,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    height: 64,
    width: 64,
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
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  action: {
    flexGrow: 1,
    minWidth: 96,
  },
  detailAction: {
    borderColor: colors.text,
    borderWidth: 1,
  },
});
