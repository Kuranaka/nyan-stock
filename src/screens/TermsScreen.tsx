import { ScrollView, StyleSheet, Text } from 'react-native';

import { AppCard } from '@/components/AppCard';
import { colors } from '@/constants/colors';

export default function TermsScreen() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <AppCard>
        <Text style={styles.title}>利用規約</Text>
        <Text style={styles.text}>
          本アプリは猫用品の在庫管理を補助するものです。獣医療上の診断や助言を行うものではありません。フードや健康に不安がある場合は獣医師に相談してください。
        </Text>
        <Text style={styles.text}>
          商品購入は外部サイトの規約に従います。外部サイトでの商品内容、価格、配送、返品などについては各サイトの案内を確認してください。
        </Text>
        <Text style={styles.todo}>TODO: 正式リリース前に文面を見直す。</Text>
      </AppCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 18,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 12,
  },
  text: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 25,
    marginBottom: 12,
  },
  todo: {
    color: colors.primaryDark,
    fontSize: 14,
    fontWeight: '800',
  },
});
