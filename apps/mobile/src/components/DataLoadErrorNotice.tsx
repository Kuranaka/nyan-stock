import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/constants/colors';

import { AppButton } from './AppButton';
import { AppCard } from './AppCard';

export function DataLoadErrorNotice({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <View accessibilityRole="alert">
      <AppCard style={styles.card}>
        <Text style={styles.title}>共有データを読み込めませんでした</Text>
        <Text style={styles.message}>{message}</Text>
        <AppButton title="もう一度読み込む" variant="secondary" onPress={onRetry} />
      </AppCard>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderColor: colors.warning, gap: 10 },
  title: { color: colors.text, fontSize: 15, fontWeight: '800' },
  message: { color: colors.subText, fontSize: 13, lineHeight: 20 },
});
