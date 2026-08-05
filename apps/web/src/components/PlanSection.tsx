import { SectionTitle } from '@/components/SectionTitle';
import { appStoreUrl } from '@/lib/site';

const freePlanFeatures = [
  'ペットプロフィール 2件まで',
  '用品 10件まで',
  '家族共有・複数端末同期',
  '購入履歴・費用ダッシュボード',
  '広告あり'
];

const plusPlanFeatures = [
  'ペットプロフィール 無制限',
  '用品 無制限',
  '広告なし'
];

export function PlanSection() {
  return (
    <section id="plans" className="scroll-mt-24 px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <SectionTitle
          eyebrow="PLAN"
          title="無料でも、主要な機能を使えます"
          description="まずは無料で始めて、登録数を増やしたくなったらPlusへ。共有や費用管理は無料プランでも利用できます。"
        />

        <div className="grid gap-5 md:grid-cols-2">
          <PlanCard
            badge="無料プラン"
            description="少ない用品から気軽に始めたい方へ"
            features={freePlanFeatures}
            title="0円"
          />

          <PlanCard
            badge="Plus"
            description="ペットや用品を上限なく登録したい方へ"
            features={plusPlanFeatures}
            highlighted
            title="登録数無制限"
          >
            <p className="text-sm leading-6 text-white/75">
              価格と契約期間は、App Storeに表示される内容をご確認ください。
            </p>
            <a
              href={appStoreUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-flex w-full items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-black text-ink transition hover:bg-honey"
            >
              App Storeで価格を確認
            </a>
          </PlanCard>
        </div>
      </div>
    </section>
  );
}

function PlanCard({
  badge,
  children,
  description,
  features,
  highlighted = false,
  title
}: {
  badge: string;
  children?: React.ReactNode;
  description: string;
  features: string[];
  highlighted?: boolean;
  title: string;
}) {
  return (
    <article
      className={`rounded-[30px] border p-6 shadow-soft sm:p-8 ${
        highlighted ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink'
      }`}
    >
      <p
        className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${
          highlighted ? 'bg-honey text-ink' : 'bg-honey text-caramel'
        }`}
      >
        {badge}
      </p>
      <h3 className="mt-5 text-3xl font-black">{title}</h3>
      <p className={`mt-2 text-sm leading-6 ${highlighted ? 'text-white/75' : 'text-muted'}`}>
        {description}
      </p>

      <ul className="mt-6 space-y-3">
        {features.map((feature) => (
          <li key={feature} className="flex gap-3 text-sm font-bold leading-6">
            <span
              aria-hidden="true"
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs ${
                highlighted ? 'bg-caramel text-white' : 'bg-honey text-caramel'
              }`}
            >
              ✓
            </span>
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      {children ? <div className="mt-6 border-t border-white/15 pt-6">{children}</div> : null}
    </article>
  );
}
