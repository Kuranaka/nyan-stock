import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

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
  petNames?: string[];
};

const statusLabels = {
  in_stock: '在庫あり',
  watch: 'そろそろ',
  warning: 'もうすぐ',
  out: '在庫切れ',
  unknown: '日数未設定',
} as const;

export function InventoryCard({ item, onPurchase, onReplenish, onDetail, petNames }: Props) {
  const remainingDays = calculateRemainingDays(item);
  const percent = calculateRemainingPercent(item);
  const status = getInventoryStatus(item);
  const progressPercent = Math.max(0, Math.min(100, percent ?? 0));
  const isPurchasePriority = status === 'out' || status === 'warning' || status === 'watch';
  const purchaseTitle =
    status === 'out' ? '購入先を探す' : isPurchasePriority ? '買い足す' : '購入先を見る';
  const remainingText =
    remainingDays === undefined ? '日数未設定' : `${Math.max(0, remainingDays)}日`;
  const petLabel = petNames?.filter(Boolean).join('・');
  const metadata = [categoryLabels[item.category], petLabel].filter(Boolean).join('　');
  const detailLabel = [
    item.name,
    metadata,
    `残り ${remainingText}`,
    `在庫状況 ${statusLabels[status]}`,
    percent === undefined ? undefined : `残量の目安 ${progressPercent}%`,
  ]
    .filter(Boolean)
    .join('、');
  const progressColor =
    status === 'out'
      ? colors.danger
      : status === 'warning'
        ? colors.urgent
        : status === 'watch'
          ? colors.warning
          : colors.success;

  return (
    <AppCard style={styles.card}>
      <Pressable
        accessibilityHint="詳細を表示します"
        accessibilityLabel={detailLabel}
        accessibilityRole="button"
        onPress={onDetail}
        style={({ pressed }) => [styles.detailSurface, pressed && styles.detailSurfacePressed]}
      >
        <View style={styles.header}>
          <View style={styles.thumbnail}>
            {item.imageUrl ? (
              <Image
                accessible={false}
                source={{ uri: item.imageUrl }}
                style={styles.thumbnailImage}
                resizeMode="contain"
              />
            ) : (
              <Text accessible={false} style={styles.placeholderText}>
                画像なし
              </Text>
            )}
          </View>

          <View style={styles.titleWrap}>
            <View style={styles.titleRow}>
              <Text numberOfLines={2} style={styles.name}>
                {item.name}
              </Text>
              <Text accessible={false} style={styles.chevron}>
                ›
              </Text>
            </View>
            <Text numberOfLines={1} style={styles.category}>
              {metadata}
            </Text>
          </View>
        </View>

        <View style={styles.summary}>
          <View style={styles.remaining}>
            <Text style={styles.metricLabel}>残り</Text>
            <Text
              style={[styles.metricValue, remainingDays === undefined && styles.metricValueUnset]}
            >
              {remainingText}
            </Text>
          </View>
          <StatusBadge status={status} />
        </View>
      </Pressable>

      {percent !== undefined ? (
        <View>
          <View style={styles.progressHeader}>
            <Text style={styles.progressLabel}>残量の目安</Text>
            <Text style={styles.progressValue}>{progressPercent}%</Text>
          </View>
          <View
            accessible
            accessibilityLabel="残量の目安"
            accessibilityRole="progressbar"
            accessibilityValue={{
              min: 0,
              max: 100,
              now: progressPercent,
              text: `${progressPercent}%`,
            }}
            style={styles.progressTrack}
          >
            <View
              style={[
                styles.progressBar,
                { backgroundColor: progressColor, width: `${progressPercent}%` },
              ]}
            />
          </View>
        </View>
      ) : null}

      <View style={styles.actions}>
        <AppButton
          title={purchaseTitle}
          onPress={onPurchase}
          variant={isPurchasePriority ? 'primary' : 'secondary'}
          style={styles.action}
        />
        <AppButton
          title="補充を記録"
          variant={isPurchasePriority ? 'secondary' : 'primary'}
          onPress={onReplenish}
          style={styles.action}
        />
      </View>
      <Text style={styles.affiliate}>
        購入先リンクにはアフィリエイトリンクが含まれる場合があります
      </Text>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 12,
    padding: 14,
  },
  detailSurface: {
    borderRadius: 12,
    gap: 10,
  },
  detailSurfacePressed: {
    opacity: 0.72,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  thumbnail: {
    alignItems: 'center',
    backgroundColor: colors.muted,
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    height: 56,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 56,
  },
  thumbnailImage: {
    height: '100%',
    width: '100%',
  },
  placeholderText: {
    color: colors.subText,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  titleWrap: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  titleRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 6,
  },
  name: {
    color: colors.text,
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 21,
  },
  chevron: {
    color: colors.subText,
    fontSize: 24,
    lineHeight: 24,
  },
  category: {
    color: colors.subText,
    fontSize: 12,
  },
  summary: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  remaining: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: 6,
  },
  metricLabel: {
    color: colors.subText,
    fontSize: 12,
    fontWeight: '700',
  },
  metricValue: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.5,
    lineHeight: 34,
  },
  metricValueUnset: {
    fontSize: 18,
    letterSpacing: 0,
    lineHeight: 26,
  },
  progressHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  progressLabel: {
    color: colors.subText,
    fontSize: 12,
  },
  progressValue: {
    color: colors.subText,
    fontSize: 12,
    fontWeight: '700',
  },
  progressTrack: {
    height: 6,
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
    gap: 8,
  },
  action: {
    flex: 1,
  },
  affiliate: {
    color: colors.subText,
    fontSize: 12,
    lineHeight: 18,
  },
});
