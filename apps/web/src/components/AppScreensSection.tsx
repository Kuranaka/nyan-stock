import Image from 'next/image';
import { SectionTitle } from '@/components/SectionTitle';

const screens = [
  {
    src: '/screenshots/inventory-home.png',
    alt: '在庫の残り日数と残量、購入・補充ボタンを表示したホーム画面',
    title: 'ホーム画面',
    description: '残り日数と残量を見ながら、必要なものをすぐ確認できます。'
  },
  {
    src: '/screenshots/expense-summary.png',
    alt: '月額目安と今月の実績、購入履歴を表示した費用ダッシュボード画面',
    title: '費用ダッシュボード',
    description: '月額の目安と購入実績を、ひとつの画面で確認できます。'
  },
  {
    src: '/screenshots/expense-category.png',
    alt: 'カテゴリ別の月額内訳と商品ごとの月額を表示した費用ダッシュボード画面',
    title: 'カテゴリ別の内訳',
    description: 'フードやおやつなど、カテゴリごとの費用も分かります。'
  }
];

export function AppScreensSection() {
  return (
    <section className="px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <SectionTitle title="実際の画面で、在庫と費用をまとめて管理" />
        <div className="grid gap-8 md:grid-cols-2 xl:grid-cols-3">
          {screens.map((screen) => (
            <article key={screen.src} className="overflow-hidden rounded-[28px] border border-line bg-white shadow-soft">
              <div className="bg-cream p-3">
                <Image
                  src={screen.src}
                  alt={screen.alt}
                  width={1206}
                  height={2622}
                  className="h-[540px] w-full rounded-[20px] object-cover object-top sm:h-[680px]"
                  sizes="(min-width: 1280px) 360px, (min-width: 768px) 45vw, 100vw"
                />
              </div>
              <div className="px-5 pb-6 pt-2">
                <h3 className="text-xl font-black text-ink">{screen.title}</h3>
                <p className="mt-2 text-sm leading-7 text-muted">{screen.description}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
