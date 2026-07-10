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
        <Text style={styles.title}>バーコード読み取りは準備中です</Text>
        <Text style={styles.body}>
          この機能は今後のアップデートで対応予定です。現在は「アプリに登録済みの商品から選択する」または「手入力で追加」をご利用ください。
        </Text>
        <AppButton title="商品登録へ戻る" onPress={() => router.replace('/inventory-form')} />
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
