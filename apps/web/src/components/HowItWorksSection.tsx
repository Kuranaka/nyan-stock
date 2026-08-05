import { SectionTitle } from '@/components/SectionTitle';

const steps = [
  ['ペットと用品を登録', '猫、犬、うさぎなど8区分に対応。用品は商品名・ブランド名から選ぶか、手入力できます。'],
  ['残り日数の出し方を選ぶ', '補充履歴から自動学習、だいたいの日数、使用量から計算、日数表示なしを選べます。'],
  ['いつもの補充を記録', '2回分の補充日がたまると、その間隔から次の買い時を自動で予測します。'],
  ['買い時と費用を確認', '在庫画面と通知で買い時を確認し、今月の実績や今後30日の見込みも把握できます。'],
  ['必要なときに購入先へ', '登録URLまたは商品名検索から外部ショップを開けます。購入は各ショップで行います。']
];

export function HowItWorksSection() {
  return (
    <section id="how-to-use" className="px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <SectionTitle
          eyebrow="How to use"
          title="補充を記録するほど、買い時が分かる"
          description="細かな情報はあとからで大丈夫。まずはペットと、いつもの用品から始められます。"
        />
        <div className="grid gap-4 md:grid-cols-2">
          {steps.map(([title, body], index) => (
            <article
              key={title}
              className={`flex gap-4 rounded-[28px] border border-line bg-white p-5 shadow-soft ${index === steps.length - 1 ? 'md:col-span-2 md:w-[calc(50%_-_0.5rem)] md:justify-self-center' : ''}`}
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-ink text-sm font-black text-white">
                {index + 1}
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-ink">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted">{body}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
