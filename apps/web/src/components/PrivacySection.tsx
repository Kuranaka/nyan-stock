import Link from 'next/link';
import { SectionTitle } from '@/components/SectionTitle';

const points = [
  'メールアドレスを入力せず、Supabaseの匿名ユーザーIDでゲスト開始',
  'Google・Appleログインは任意。共有コードの作成やデータの引き継ぎに利用',
  '共有を使わないペット・在庫・購入履歴は原則として端末内に保存',
  '共有データはクラウドに保存し、参加者間で同期',
  '設定したペット・商品画像は公開URLで表示。個人や機微情報を含む画像は設定しないでください',
  '無料プランの広告は同意状況に応じて配信。許可なくIDFAを使ったパーソナライズ広告は配信しません',
  '端末内データの初期化とアカウント削除は別操作。アカウント削除はログイン情報・個人用クラウドデータ・アップロード画像を削除',
  '住所・電話番号・正確な位置情報・決済情報の入力を求めません'
];

export function PrivacySection() {
  return (
    <section className="px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <SectionTitle title="プライバシーに配慮した設計です" />
        <p className="mx-auto mb-6 max-w-3xl text-center text-sm leading-7 text-muted">
          Googleログインでメール本文、Google Drive、カレンダーなどへアクセスすることはありません。
          外部サービス、保持期間、削除の取扱いを含む詳細は、
          <Link className="font-bold text-caramel underline-offset-4 hover:underline" href="/privacy">
            プライバシーポリシー
          </Link>
          をご確認ください。
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {points.map((point) => (
            <div key={point} className="rounded-[24px] border border-line bg-white p-5 text-sm font-bold leading-6 text-ink shadow-soft">
              {point}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
