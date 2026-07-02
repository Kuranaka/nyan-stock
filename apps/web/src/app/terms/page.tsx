import { LegalPage } from '@/components/LegalPage';

export default function TermsPage() {
  return (
    <LegalPage
      title="利用規約"
      lead="このページは公開前確認用の仮文面です。正式リリース前に、実際の提供内容に合わせて見直します。"
      items={[
        '本サービスは猫用品の在庫管理を補助するもの',
        '獣医療上の診断や助言を行うものではない',
        '商品購入は外部サイトの規約に従う',
        'サービス内容は変更される可能性がある'
      ]}
    />
  );
}
