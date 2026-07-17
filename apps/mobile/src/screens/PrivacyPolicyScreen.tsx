import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { AppCard } from '@/components/AppCard';
import { colors } from '@/constants/colors';

const sections = [
  {
    title: '1. 取得する情報',
    body: [
      '本アプリでは、利用者が入力した猫プロフィール、在庫情報、購入履歴、商品リンク、通知設定、EC API設定などを取り扱います。',
      'ログインや共有同期を利用しない場合、これらの情報は原則として利用者の端末内に保存されます。',
      'Googleログインを選択した場合、認証に必要なGoogleアカウントの一意の識別子、メールアドレス、表示名、プロフィール画像を取得します。Googleアカウントのメール本文、Google Drive、カレンダー、連絡先その他のGoogleサービス上のデータにはアクセスしません。',
      'GoogleまたはAppleによるログイン、匿名ゲスト参加、共有コードによるクラウド同期を利用する場合、認証情報、共有スペースID、猫プロフィール、在庫情報、購入履歴などが、同期機能を提供するためSupabase上に保存される場合があります。',
      'Plusの購入・復元・購読状態の確認にはRevenueCatを利用します。RevenueCatでは、アプリストア上の購入情報、購読状態、商品ID、匿名の利用者識別子などが処理されます。運営者はクレジットカード番号などの決済情報を取得しません。',
      '広告を表示する場合、Google AdMobおよびその広告パートナーが、広告の配信に必要な情報を処理することがあります。これには、広告用の端末識別子（iOSのIDFA、AndroidのAdvertising ID）、IPアドレス、端末・アプリに関する情報、広告の表示・クリック等の広告イベントが含まれる場合があります。',
      '利用者が必要な同意をした場合、これらの情報を、他社のアプリやWebサイトをまたぐ広告のパーソナライズおよび広告効果の測定に利用することがあります。猫プロフィール、在庫情報、購入履歴、商品リンク、Googleログイン情報その他利用者が本アプリに入力した情報を、運営者が広告のターゲティング目的でGoogle AdMobへ送信することはありません。',
      '本アプリは、住所、電話番号、正確な位置情報、決済情報を取得することを目的としていません。',
    ],
  },
  {
    title: '2. 利用目的',
    body: [
      '入力された情報は、猫用品の在庫、残り日数、購入履歴、商品リンク、通知設定を表示・管理するために利用されます。',
      'Googleから取得する情報は、ログインの本人確認、アカウントの識別、プロフィール表示および共有・複数端末同期の提供のためにのみ利用します。広告配信、販売、データブローカーへの提供、またはGoogleサービス上のデータへのアクセスには利用しません。',
      'ログイン情報および共有同期データは、複数端末または家族・他アカウントとの在庫共有、データ復元、同期状態の管理のために利用されます。',
      '購入情報は、Plusの有効化、広告非表示、登録数上限の解除、購入復元、購読管理導線の表示のために利用されます。',
      '広告関連データは、広告の配信、パーソナライズ、広告効果の測定および不正利用の防止のために利用される場合があります。',
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
    title: '5. 外部サービス',
    body: [
      '本アプリは、認証および共有同期のためにSupabase、Googleログイン、Appleログインを利用する場合があります。これらの外部サービスで取り扱われる情報は、各サービスの規約およびプライバシーポリシーに従います。',
      'Plusの購入管理のためにRevenueCatを利用する場合があります。アプリストアでの購入、復元、サブスクリプション管理は、Appleの規約およびRevenueCatの取扱いに従います。',
      '商品検索や商品リンクの生成では、楽天市場、Yahoo!ショッピング等の外部サービスを利用する場合があります。',
      '広告の配信、同意の取得・管理、広告効果の測定のために、Google AdMobおよびGoogle User Messaging Platform（UMP）を利用します。Googleによる情報の取扱いについては、Googleの「Google のサービスを使用するサイトやアプリから収集した情報の Google による使用」をご確認ください。',
    ],
  },
  {
    title: '6. Googleユーザーデータの保存・共有',
    body: [
      'Googleから取得した識別子、メールアドレス、表示名およびプロフィール画像は、認証・同期基盤であるSupabaseに保存される場合があります。Supabaseは、本アプリに認証およびクラウド同期を提供するための委託先です。',
      '運営者は、Googleから取得した情報を第三者に販売、貸与または広告目的で提供しません。共有コードで共有スペースへ参加した場合を除き、他の利用者にGoogleアカウント情報を公開しません。',
    ],
  },
  {
    title: '7. 第三者提供',
    body: [
      '運営者は、法令に基づく場合、利用者の同意がある場合、または人の生命・身体・財産の保護のために必要な場合を除き、取得した個人情報を第三者に提供しません。',
      '広告については、必要な同意その他の適法な根拠に基づき、Google AdMobおよび選択された広告パートナーが、広告配信、パーソナライズ、効果測定および不正防止のために広告関連データを処理する場合があります。これらの事業者が日本国外で情報を取り扱う場合があります。',
    ],
  },
  {
    title: '8. 広告に関する選択と変更',
    body: [
      'iOSでは、広告を読み込む前にApp Tracking Transparency（ATT）の許可を求めます。ATTが許可されない場合、IDFAを利用したパーソナライズ広告は配信しません。',
      '地域によって必要な場合、Google User Messaging Platform（UMP）を通じて広告に関する同意を求めます。同意が拒否・未完了の場合は、非パーソナライズ広告または限定広告が表示されることがあります。',
      '広告に関する同意内容は、設定画面の「広告のプライバシー設定」から変更できます。また、iOSの端末設定およびGoogleの広告設定からも、広告に関する設定を変更できる場合があります。',
    ],
  },
  {
    title: '9. データ管理',
    body: [
      '端末内に保存されたデータのバックアップ、端末の紛失・故障・機種変更への備えは、利用者自身の責任で管理してください。',
      'アプリ内のデータ初期化機能または端末のアプリ削除により、端末内に保存されたデータを削除できます。',
      '設定画面の「アカウントを削除」から、ログイン情報、個人用のクラウドデータおよびアップロードしたアイコンの削除を開始できます。',
      '共有スペースに他の参加者がいる場合、その共有データは他の参加者のために残ります。',
    ],
  },
  {
    title: '10. 開示・訂正・削除等',
    body: [
      'Googleログイン情報、共有同期データその他運営者が保有する自己の個人情報について、開示、訂正、利用停止、削除等を希望する場合は、設定画面のアカウント削除またはWebサイトに掲載するお問い合わせ先からご連絡ください。本人確認後、法令およびサービス運用上必要な範囲を除き対応します。',
    ],
  },
  {
    title: '11. 変更',
    body: [
      '運営者は、法令の変更、サービス内容の変更、運用上の必要に応じて、本ポリシーを変更することがあります。重要な変更がある場合は、本アプリまたはWebサイト上でお知らせします。',
    ],
  },
];

export default function PrivacyPolicyScreen() {
  const { width } = useWindowDimensions();
  // ScrollView (18px), card border (2px), and card padding (32px).
  // Supplying the measured width avoids an iOS text-layout edge case where a
  // long final line can be drawn beyond the card without contributing height.
  const textWidth = Math.max(width - 70, 0);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <AppCard>
        <Text style={styles.meta}>施行日: 2026年7月12日</Text>
        <Text style={styles.title}>プライバシーポリシー</Text>
        <Text style={[styles.text, { width: textWidth }]}>
          にゃんストック運営（以下「運営者」といいます。）は、猫用品の在庫管理・買い忘れ防止アプリ「にゃんストック」（以下「本アプリ」といいます。）における利用者情報の取扱いについて、以下のとおり定めます。
        </Text>
        {sections.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.heading}>{section.title}</Text>
            {section.body.map((paragraph) => (
              <View key={paragraph} style={styles.paragraph}>
                <Text style={[styles.text, { width: textWidth }]}>{paragraph}</Text>
              </View>
            ))}
          </View>
        ))}
        <Text style={[styles.text, { width: textWidth }]}>運営者: にゃんストック運営</Text>
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
  paragraph: {
    alignSelf: 'stretch',
    minWidth: 0,
  },
  heading: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '900',
    marginBottom: 8,
  },
  text: {
    color: colors.text,
    flexShrink: 1,
    fontSize: 15,
    lineHeight: 24,
    marginBottom: 10,
  },
});
