import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { AppButton } from '@/components/AppButton';
import { AppCard } from '@/components/AppCard';
import { colors } from '@/constants/colors';

export default function BarcodeScanScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <AppCard style={styles.card}>
        <Text style={styles.title}>バーコード読み取り</Text>
        <Text style={styles.body}>
          JANコードを読み取って商品マスタから候補を表示する機能は今後対応予定です。
        </Text>
        <AppButton title="戻る" variant="secondary" onPress={() => router.back()} />
      </AppCard>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 18,
  },
  card: {
    gap: 14,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '900',
  },
  body: {
    color: colors.subText,
    fontSize: 15,
    lineHeight: 23,
  },
});
