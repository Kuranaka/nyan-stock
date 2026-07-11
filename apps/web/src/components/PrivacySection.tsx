import { SectionTitle } from '@/components/SectionTitle';

const points = [
  '通常の在庫管理はログインなしでも利用可能',
  'Googleログインは共有・複数端末同期を使うときだけ任意で利用',
  'Googleからは識別子・メールアドレス・基本プロフィールのみを取得',
  '住所・電話番号・正確な位置情報は取得しない',
  '入力データは端末内保存を基本とし、同期時のみクラウドに保存',
  '通知は端末の設定からいつでも変更可能',
  'データ初期化はアプリ内から実行可能'
];

export function PrivacySection() {
  return (
    <section className="px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <SectionTitle title="プライバシーに配慮した設計です" />
        <p className="mx-auto mb-6 max-w-3xl text-center text-sm leading-7 text-muted">
          GoogleログインでGoogleアカウントのメール本文、Google Drive、カレンダーなどのデータへアクセスすることはありません。
          取得情報と利用目的はプライバシーポリシーで確認できます。
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
