import { SectionTitle } from '@/components/SectionTitle';

const updates = [
  {
    label: '01',
    title: '猫を主役に、8区分へ',
    body: '犬・うさぎ・小動物・鳥・観賞魚・爬虫類／両生類・昆虫まで、用品をペットごとに整理できます。'
  },
  {
    label: '02',
    title: '補充するだけで学習',
    body: '初回登録時の購入日は使わず、2件の補充記録がたまった時点から次の買い時を予測します。'
  },
  {
    label: '03',
    title: '「学習中」もひと目で',
    body: '要対応・そろそろ・学習中・日数表示なしで整理。未設定を無理に埋めなくても使い始められます。'
  },
  {
    label: '04',
    title: 'これからの費用も見える',
    body: '今月の実績に加えて、月額予測と今後30日の買い足し見込みを確認できます。'
  }
];

export function ProblemSection() {
  return (
    <section className="px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <SectionTitle
          eyebrow="What’s new"
          title="Version 2.0で、もっと自然に続けられる管理へ"
          description="最初から細かく入力しなくても大丈夫。日々の補充が、そのまま次の買い時につながります。"
        />
        <div className="grid gap-5 md:grid-cols-2">
          {updates.map((update) => (
            <article key={update.label} className="rounded-[28px] border border-line bg-white p-6 shadow-soft sm:p-7">
              <div className="flex items-start gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-honey text-sm font-black text-caramel">
                  {update.label}
                </span>
                <div>
                  <h3 className="text-xl font-black text-ink">{update.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-muted">{update.body}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
