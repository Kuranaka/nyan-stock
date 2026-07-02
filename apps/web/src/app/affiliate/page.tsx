import { LegalPage } from '@/components/LegalPage';

export default function AffiliatePage() {
  return (
    <LegalPage
      title="アフィリエイトについて"
      lead="このページは公開前確認用の仮文面です。提携プログラム確定後に表記を調整します。"
      items={[
        '商品リンクにアフィリエイトリンクが含まれる場合がある',
        'リンク経由で購入された場合、運営者が紹介料を受け取る場合がある',
        'ユーザーの購入価格は変わらない',
        'TODO: 提携プログラム確定後に文面を調整'
      ]}
    />
  );
}
