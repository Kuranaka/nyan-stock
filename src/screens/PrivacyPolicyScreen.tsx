import { ScrollView, StyleSheet, Text } from 'react-native';

import { AppCard } from '@/components/AppCard';
import { colors } from '@/constants/colors';

export default function PrivacyPolicyScreen() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <AppCard>
        <Text style={styles.title}>プライバシーポリシー</Text>
        <Text style={styles.text}>
          初期版ではログイン不要です。住所、電話番号、正確な位置情報は取得しません。入力された猫プロフィール、在庫、購入履歴などのデータは端末内に保存します。
        </Text>
        <Text style={styles.text}>
          在庫切れを防ぐため、通知機能を使う場合があります。商品リンクを開く場合、Amazon、楽天、Yahooなどの外部サイトへ移動する場合があります。
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
