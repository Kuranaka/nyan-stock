import { LegalPage } from '@/components/LegalPage';

export default function PrivacyPage() {
  return (
    <LegalPage
      title="プライバシーポリシー"
      lead="このページは公開前確認用の仮文面です。正式リリース前に、実際の仕様に合わせて見直します。"
      items={[
        '初期版ではログイン不要予定',
        '住所、電話番号、正確な位置情報は取得しない予定',
        '入力データは端末内保存を基本にする予定',
        '事前登録フォームでメールアドレスを取得する場合がある',
        '商品リンクから外部サイトへ移動する場合がある'
      ]}
    />
  );
}
