import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/AppButton';
import { colors } from '@/constants/colors';

export function InventoryMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

export function InventoryInfo({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

export function PurchaseButton({
  label,
  configured,
  saved,
  onPress,
}: {
  label: string;
  configured: boolean;
  saved: boolean;
  onPress: () => void;
}) {
  return (
    <AppButton
      title={configured ? `${label}で${saved ? '買う' : '探す'}` : `${label} URL未設定`}
      variant={saved ? 'primary' : 'secondary'}
      disabled={!configured}
      onPress={onPress}
    />
  );
}

const styles = StyleSheet.create({
  metric: { backgroundColor: colors.muted, borderRadius: 14, flex: 1, padding: 14 },
  metricLabel: { color: colors.subText, fontSize: 13 },
  metricValue: { color: colors.text, fontSize: 24, fontWeight: '900', marginTop: 4 },
  infoRow: { gap: 3 },
  infoLabel: { color: colors.subText, fontSize: 12 },
  infoValue: { color: colors.text, fontSize: 16, lineHeight: 23 },
});
