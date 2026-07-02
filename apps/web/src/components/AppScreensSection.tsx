import { MockPhone } from '@/components/MockPhone';
import { SectionTitle } from '@/components/SectionTitle';

export function AppScreensSection() {
  return (
    <section className="px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <SectionTitle title="在庫切れが近いものから、ひと目で分かる" />
        <div className="grid gap-8 lg:grid-cols-3">
          <MockPhone title="ホーム画面" variant="home" />
          <MockPhone title="商品詳細画面" variant="detail" />
          <MockPhone title="購入履歴画面" variant="history" />
        </div>
      </div>
    </section>
  );
}
