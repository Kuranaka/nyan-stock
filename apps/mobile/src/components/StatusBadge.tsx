import { StyleSheet, Text } from 'react-native';

import { colors } from '@/constants/colors';
import { InventoryStatus } from '@/features/inventory/inventoryTypes';

const labels: Record<InventoryStatus, string> = {
  in_stock: '通常',
  watch: '注意',
  warning: '警告',
  out: '在庫切れ',
  unknown: '未計算',
};

const badgeColors: Record<InventoryStatus, { bg: string; fg: string }> = {
  in_stock: { bg: colors.successLight, fg: colors.success },
  watch: { bg: colors.warningLight, fg: colors.primaryDark },
  warning: { bg: colors.warningLight, fg: colors.warning },
  out: { bg: colors.dangerLight, fg: colors.danger },
  unknown: { bg: colors.muted, fg: colors.subText },
};

type Props = {
  status: InventoryStatus;
};

export function StatusBadge({ status }: Props) {
  const palette = badgeColors[status];
  return (
    <Text style={[styles.badge, { backgroundColor: palette.bg, color: palette.fg }]}>
      {labels[status]}
    </Text>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    fontSize: 13,
    fontWeight: '800',
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
});
