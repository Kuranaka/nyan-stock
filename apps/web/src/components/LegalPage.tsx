import Link from 'next/link';
import { Footer } from '@/components/Footer';
import { supportEmail } from '@/lib/site';

type LegalSection = {
  title: string;
  body: string[];
};

type LegalPageProps = {
  title: string;
  lead: string;
  effectiveDate: string;
  lastUpdatedDate?: string;
  sections: LegalSection[];
};

export function LegalPage({ title, lead, effectiveDate, lastUpdatedDate, sections }: LegalPageProps) {
  return (
    <>
      <main className="min-h-screen px-4 py-10 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <Link href="/" className="text-sm font-bold text-caramel hover:text-ink">
            にゃんストックへ戻る
          </Link>
          <article className="mt-8 rounded-[28px] border border-line bg-white p-6 shadow-soft sm:p-10">
            <p className="text-sm font-bold text-caramel">施行日: {effectiveDate}</p>
            {lastUpdatedDate ? (
              <p className="mt-1 text-sm font-bold text-caramel">最終更新日: {lastUpdatedDate}</p>
            ) : null}
            <h1 className="mt-3 text-3xl font-black text-ink sm:text-4xl">{title}</h1>
            <p className="mt-5 leading-8 text-muted">{lead}</p>
            <div className="mt-10 space-y-8">
              {sections.map((section, index) => (
                <section key={section.title}>
                  <h2 className="text-xl font-black text-ink">
                    第{index + 1}条 {section.title}
                  </h2>
                  <div className="mt-3 space-y-3">
                    {section.body.map((paragraph) => (
                      <p key={paragraph} className="text-sm leading-7 text-muted">
                        {paragraph}
                      </p>
                    ))}
                  </div>
                </section>
              ))}
            </div>
            <p className="mt-10 text-sm leading-7 text-muted">
              お問い合わせは <Link className="font-bold text-caramel hover:text-ink" href="/support">お問い合わせページ</Link> からご連絡ください。
              {supportEmail ? `（連絡先: ${supportEmail}）` : ''}
            </p>
          </article>
        </div>
      </main>
      <Footer />
    </>
  );
}
