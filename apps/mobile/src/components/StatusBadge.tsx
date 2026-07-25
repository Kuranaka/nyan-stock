import { StyleSheet, Text } from 'react-native';

import { colors } from '@/constants/colors';
import { InventoryStatus } from '@/features/inventory/inventoryTypes';

const labels: Record<InventoryStatus, string> = {
  in_stock: '在庫あり',
  watch: 'そろそろ',
  warning: 'もうすぐ',
  out: '在庫切れ',
  unknown: '日数未設定',
};

const badgeColors: Record<InventoryStatus, { bg: string; fg: string }> = {
  in_stock: { bg: colors.successLight, fg: colors.success },
  watch: { bg: colors.warningLight, fg: colors.warning },
  warning: { bg: colors.urgentLight, fg: colors.urgent },
  out: { bg: colors.dangerLight, fg: colors.danger },
  unknown: { bg: colors.muted, fg: colors.neutral },
};

type Props = {
  status: InventoryStatus;
};

export function StatusBadge({ status }: Props) {
  const palette = badgeColors[status];
  return (
    <Text
      accessibilityLabel={`在庫状況: ${labels[status]}`}
      style={[styles.badge, { backgroundColor: palette.bg, color: palette.fg }]}
    >
      {labels[status]}
    </Text>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    fontSize: 12,
    fontWeight: '800',
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
});
