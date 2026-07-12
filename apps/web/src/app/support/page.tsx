import type { Metadata } from 'next';
import Link from 'next/link';
import { Footer } from '@/components/Footer';
import { supportEmail } from '@/lib/site';

export const metadata: Metadata = {
  title: 'お問い合わせ｜にゃんストック',
  description: 'にゃんストックへのお問い合わせ窓口です。'
};

export default function SupportPage() {
  return (
    <>
      <main className="min-h-screen px-4 py-10 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <Link href="/" className="text-sm font-bold text-caramel hover:text-ink">
            にゃんストックへ戻る
          </Link>

          <article className="mt-8 rounded-[28px] border border-line bg-white p-6 shadow-soft sm:p-10">
            <p className="text-sm font-bold text-caramel">SUPPORT</p>
            <h1 className="mt-3 text-3xl font-black text-ink sm:text-4xl">お問い合わせ</h1>
            <p className="mt-5 leading-8 text-muted">
              にゃんストックに関するご質問、不具合のご報告、ご意見・ご要望は、以下の窓口からお寄せください。
            </p>

            <section className="mt-8 rounded-2xl bg-honey/60 p-5">
              <h2 className="text-lg font-black text-ink">お問い合わせの前に</h2>
              <ul className="mt-3 space-y-2 text-sm leading-7 text-muted">
                <li>・不具合については、利用端末・OS・アプリのバージョンと、発生した状況をお知らせください。</li>
                <li>・購入済みの機能については、購入に使用したストアと購入日時を添えてください。</li>
                <li>・内容によっては、ご返信までお時間をいただく場合や、ご返信できない場合があります。</li>
              </ul>
            </section>

            <section className="mt-8">
              <h2 className="text-xl font-black text-ink">お問い合わせ窓口</h2>
              {supportEmail ? (
                <>
                  <p className="mt-3 text-sm leading-7 text-muted">
                    メールでお問い合わせください。個人情報やパスワードなどの機密情報は、メール本文に記載しないようお願いいたします。
                  </p>
                  <a
                    className="mt-5 inline-flex rounded-full bg-caramel px-6 py-3 text-sm font-bold text-white transition hover:bg-ink"
                    href={`mailto:${supportEmail}`}
                  >
                    メールで問い合わせる
                  </a>
                  <p className="mt-4 text-sm text-muted">メールアドレス: {supportEmail}</p>
                </>
              ) : (
                <p className="mt-3 text-sm leading-7 text-muted">
                  お問い合わせ用メールアドレスを準備中です。公開前に運営者が連絡先を設定します。
                </p>
              )}
            </section>

            <p className="mt-10 text-sm leading-7 text-muted">
              個人情報の取扱いについては、<Link className="font-bold text-caramel hover:text-ink" href="/privacy">プライバシーポリシー</Link>をご確認ください。
            </p>
          </article>
        </div>
      </main>
      <Footer />
    </>
  );
}
