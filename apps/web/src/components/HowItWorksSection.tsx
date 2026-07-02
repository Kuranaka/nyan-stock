import { SectionTitle } from '@/components/SectionTitle';

const steps = [
  ['いつもの猫用品を登録', 'フード、猫砂、おやつなどを登録。'],
  ['内容量と消費ペースを入力', '「この商品は何日くらい持つ？」でも入力可能。'],
  ['残り日数を自動表示', '在庫切れが近い順にホーム画面で確認。'],
  ['なくなる前に通知', '買い忘れる前にお知らせ。'],
  ['いつもの商品を再購入', '登録したURLからすぐ購入。']
];

export function HowItWorksSection() {
  return (
    <section id="how-to-use" className="px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <SectionTitle title="使い方はかんたん" />
        <div className="space-y-4">
          {steps.map(([title, body], index) => (
            <article key={title} className="flex gap-4 rounded-[28px] border border-line bg-white p-5 shadow-soft">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-ink text-sm font-black text-white">
                {index + 1}
              </div>
              <div>
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
