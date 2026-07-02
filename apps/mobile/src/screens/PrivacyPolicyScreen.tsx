import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppCard } from '@/components/AppCard';
import { colors } from '@/constants/colors';

const sections = [
  {
    title: '1. 取得する情報',
    body: [
      '本アプリでは、利用者が入力した猫プロフィール、在庫情報、購入履歴、商品リンク、通知設定、EC API設定などを取り扱います。',
      'これらの情報は、原則として利用者の端末内に保存されます。ログイン機能やクラウド同期を提供しない範囲では、運営者が端末内データを取得することはありません。',
      '本アプリは、住所、電話番号、正確な位置情報、決済情報、獣医療上の診断情報を取得することを目的としていません。',
    ],
  },
  {
    title: '2. 利用目的',
    body: [
      '入力された情報は、猫用品の在庫、残り日数、購入履歴、商品リンク、通知設定を表示・管理するために利用されます。',
      '商品検索機能を利用する場合、検索キーワードやAPI利用に必要な情報が、利用者の操作に基づいて外部の商品検索サービスへ送信される場合があります。',
    ],
  },
  {
    title: '3. 通知',
    body: [
      '本アプリは、在庫切れや補充時期に気づきやすくするため、端末のローカル通知機能を利用する場合があります。通知の許可や停止は、端末設定またはアプリ内設定から変更できます。',
    ],
  },
  {
    title: '4. 外部サイト・商品リンク',
    body: [
      '本アプリでは、Amazon、楽天市場、Yahoo!ショッピング等の外部サイトへの商品リンクを開く場合があります。外部サイトで取得される情報は、各外部サイトのプライバシーポリシーに従って取り扱われます。',
      '商品リンクにはアフィリエイトリンクが含まれる場合があります。リンク経由で商品を購入した場合、運営者が紹介料を受け取ることがありますが、利用者の購入価格が変わることはありません。',
    ],
  },
  {
    title: '5. 第三者提供',
    body: [
      '運営者は、法令に基づく場合、利用者の同意がある場合、または人の生命・身体・財産の保護のために必要な場合を除き、取得した個人情報を第三者に提供しません。',
    ],
  },
  {
    title: '6. データ管理',
    body: [
      '端末内に保存されたデータのバックアップ、端末の紛失・故障・機種変更への備えは、利用者自身の責任で管理してください。',
      'アプリ内の削除機能または端末のアプリ削除により、端末内に保存されたデータを削除できます。',
    ],
  },
  {
    title: '7. 開示・訂正・削除等',
    body: [
      '運営者が保有する自己の個人情報について、開示、訂正、利用停止、削除等を希望する場合は、本サービスまたはWebサイトに掲載するお問い合わせ先からご連絡ください。',
    ],
  },
  {
    title: '8. 変更',
    body: [
      '運営者は、法令の変更、サービス内容の変更、運用上の必要に応じて、本ポリシーを変更することがあります。重要な変更がある場合は、本アプリまたはWebサイト上でお知らせします。',
    ],
  },
];

export default function PrivacyPolicyScreen() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <AppCard>
        <Text style={styles.meta}>施行日: 2026年7月3日</Text>
        <Text style={styles.title}>プライバシーポリシー</Text>
        <Text style={styles.text}>
          にゃんストック運営（以下「運営者」といいます。）は、猫用品の在庫管理・買い忘れ防止アプリ「にゃんストック」（以下「本アプリ」といいます。）における利用者情報の取扱いについて、以下のとおり定めます。
        </Text>
        {sections.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.heading}>{section.title}</Text>
            {section.body.map((paragraph) => (
              <Text key={paragraph} style={styles.text}>
                {paragraph}
              </Text>
            ))}
          </View>
        ))}
        <Text style={styles.text}>運営者: にゃんストック運営</Text>
      </AppCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 18,
  },
  meta: {
    color: colors.primaryDark,
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 8,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 12,
  },
  section: {
    marginTop: 14,
  },
  heading: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '900',
    marginBottom: 8,
  },
  text: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 24,
    marginBottom: 10,
  },
});
