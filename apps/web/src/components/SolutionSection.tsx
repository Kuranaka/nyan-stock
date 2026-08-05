import { FeatureCard } from '@/components/FeatureCard';
import { SectionTitle } from '@/components/SectionTitle';

const features = [
  {
    icon: '🐾',
    title: 'ペットごとにすっきり管理',
    body: '猫を中心に8区分へ対応。複数のペットがいても、プロフィールと用品を分けて見られます。'
  },
  {
    icon: '学',
    title: '補充から買い時を自動学習',
    body: '補充を2回記録すると、その間隔から次の買い時を予測。だいたいの日数や使用量からの計算も選べます。'
  },
  {
    icon: '整',
    title: '必要なものから確認',
    body: '要対応・そろそろ・学習中・日数表示なしで整理。買い時が近い用品を迷わず確認できます。'
  },
  {
    icon: '円',
    title: '支出とこれからを見える化',
    body: '今月の実績、月額予測、今後30日の買い足し見込みをまとめて確認できます。'
  },
  {
    icon: '買',
    title: 'いつもの購入先をすぐ確認',
    body: '登録URLを開くほか、URLがなくても商品名からAmazon・楽天・Yahooを検索できます。購入は外部サイトで行います。'
  },
  {
    icon: '共',
    title: '家族とも同じ在庫を共有',
    body: '共有コードでペット・在庫・購入履歴を同期。買った人と補充した人が違っても、同じ状態を確認できます。'
  }
];

export function SolutionSection() {
  return (
    <section id="features" className="px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <SectionTitle
          eyebrow="Features"
          title="買い時も、費用も、家族との共有もひとつに"
          description="入力を増やすのではなく、普段の補充記録を次の行動に変える機能を揃えました。"
        />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <FeatureCard key={feature.title} {...feature} />
          ))}
        </div>
      </div>
    </section>
  );
}
