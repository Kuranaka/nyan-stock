import { FeatureCard } from '@/components/FeatureCard';
import { SectionTitle } from '@/components/SectionTitle';

const features = [
  {
    icon: '日',
    title: '残り日数を自動計算',
    body: '内容量と1日あたりの消費量から、残り何日でなくなるかを表示。'
  },
  {
    icon: '知',
    title: 'なくなる前に通知',
    body: '残り7日、3日、1日など、買い忘れやすいタイミングでお知らせ。'
  },
  {
    icon: '買',
    title: 'いつもの商品をすぐ購入',
    body: 'Amazon・楽天・Yahooなど、登録した購入URLからすぐ再購入。'
  },
  {
    icon: '履',
    title: '補充履歴を記録',
    body: 'いつ・何を・いくらで買ったかを記録。'
  },
  {
    icon: '円',
    title: '月のペット用品コストを見える化',
    body: 'フード・トイレ用品・おやつなどの支出をざっくり把握。'
  },
  {
    icon: '🐾',
    title: 'ペットごとに管理',
    body: '猫、犬、うさぎ、小動物、鳥、観賞魚、爬虫類・両生類、昆虫の8区分に対応し、用品をペットごとに整理できます。'
  }
];

export function SolutionSection() {
  return (
    <section id="features" className="px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <SectionTitle title="にゃんストックで、いつものペット用品をかんたん管理" />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <FeatureCard key={feature.title} {...feature} />
          ))}
        </div>
      </div>
    </section>
  );
}
