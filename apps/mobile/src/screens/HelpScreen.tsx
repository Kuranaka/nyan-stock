import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppCard } from '@/components/AppCard';
import { colors } from '@/constants/colors';

const sections = [
  {
    title: 'はじめに',
    items: [
      '猫プロフィールを登録してから、フードや猫砂などの商品を追加します。',
      '在庫一覧では猫を切り替えて表示できます。猫の追加・編集は、一覧上部の「猫を管理」から行えます。',
    ],
  },
  {
    title: '商品と残り日数',
    items: [
      '商品は登録済みの商品から選ぶか、手入力で追加できます。',
      '残り日数は「使い切る日数」または「内容量と1日の使用量」をもとにした目安です。実際の消費状況に合わせて更新してください。',
      '補充を記録すると、在庫量・購入日・購入履歴をまとめて更新できます。',
    ],
  },
  {
    title: '通知',
    items: [
      '設定した残り日数になると、端末に通知します。通知を受け取るには、端末側で通知を許可してください。',
      '通知時刻や通知のオン・オフは、設定画面から変更できます。',
    ],
  },
  {
    title: '共有スペース',
    items: [
      '共有する人が設定から「共有スペースを作成」を押すと、共有スペースと共有コードが作成されます。コードを家族など共有したい相手へ渡してください。',
      '参加する側は共有コードと参加名を入力します。参加すると、この端末の猫プロフィール・在庫・購入履歴は共有データで上書きされます。確認後に参加してください。',
      '共有コードを知っている人は共有データを見たり更新したりできます。必要な相手だけに渡してください。',
      '共有コードが第三者に漏れた場合は、作成者が設定から「共有コードを再発行」を選んでください。古いコードはすぐ使えなくなり、すでに参加している人の共有は続きます。',
      '作成者は設定の参加者一覧から参加者を共有スペースから外せます。外された参加者は共有データを読み書きできなくなります。',
    ],
  },
  {
    title: 'データとアカウント',
    items: [
      '共有を使わないデータは、この端末内に保存されます。端末の故障・紛失・アプリ削除に備えたい場合は、必要に応じて共有機能の利用を検討してください。',
      'ログアウトや端末内データの初期化では、共有スペースのデータは削除されません。アカウント削除では、ログイン情報と自分用のクラウドデータを削除します。',
    ],
  },
  {
    title: '購入リンクと費用',
    items: [
      '商品に購入リンクを登録すると、外部の販売サイトを開けます。価格・在庫・配送などは各販売サイトで確認してください。',
      '一部の購入リンクにはアフィリエイトリンクが含まれる場合があります。詳しくは設定の「アフィリエイトについて」をご確認ください。',
      '費用画面では、入力した購入価格をもとに月ごとの支出目安を確認できます。',
    ],
  },
];

export default function HelpScreen() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <AppCard>
        <Text style={styles.title}>にゃんストックの使い方</Text>
        <Text style={styles.lead}>在庫の記録、通知、共有についてまとめています。</Text>
        {sections.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.heading}>{section.title}</Text>
            {section.items.map((item) => (
              <View key={item} style={styles.item}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.text}>{item}</Text>
              </View>
            ))}
          </View>
        ))}
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
  },
  lead: {
    color: colors.subText,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
  },
  section: {
    gap: 8,
    marginTop: 22,
  },
  heading: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '900',
  },
  item: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 8,
  },
  bullet: {
    color: colors.primary,
    fontSize: 17,
    lineHeight: 22,
  },
  text: {
    color: colors.subText,
    flex: 1,
    fontSize: 14,
    lineHeight: 22,
  },
});
