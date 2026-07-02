import Link from 'next/link';

type LegalPageProps = {
  title: string;
  lead: string;
  items: string[];
};

export function LegalPage({ title, lead, items }: LegalPageProps) {
  return (
    <main className="min-h-screen px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="text-sm font-bold text-caramel hover:text-ink">
          にゃんストックへ戻る
        </Link>
        <article className="mt-8 rounded-[28px] border border-line bg-white p-6 shadow-soft sm:p-10">
          <p className="text-sm font-bold text-caramel">正式公開前に見直し予定</p>
          <h1 className="mt-3 text-3xl font-black text-ink sm:text-4xl">{title}</h1>
          <p className="mt-5 leading-8 text-muted">{lead}</p>
          <ul className="mt-8 space-y-4">
            {items.map((item) => (
              <li key={item} className="rounded-2xl bg-cream px-4 py-3 text-sm font-bold leading-6 text-ink">
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-8 rounded-2xl border border-line px-4 py-3 text-sm font-bold text-muted">
            TODO: 正式リリース前に法務確認
          </p>
        </article>
      </div>
    </main>
  );
}
