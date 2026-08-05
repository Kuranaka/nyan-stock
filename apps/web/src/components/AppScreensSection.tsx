import Image from 'next/image';
import { SectionTitle } from '@/components/SectionTitle';

const screens = [
  {
    src: '/screenshots/v2.0/01-buy-timing.png',
    alt: '買い足しが近い用品と残り2日を表示する、にゃんストックの在庫画面'
  },
  {
    src: '/screenshots/v2.0/03-cost-overview.png',
    alt: '今月の購入金額と月額予測を表示する、にゃんストックの費用画面'
  },
  {
    src: '/screenshots/v2.0/06-pet-profiles.png',
    alt: '猫や犬など8区分のペットを登録できる、にゃんストックのペットプロフィール画面'
  }
];

export function AppScreensSection() {
  return (
    <section className="overflow-hidden px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <SectionTitle
          eyebrow="APP EXPERIENCE"
          title="Version 2.0の実際の画面"
          description="買い時、費用、ペットごとの管理を、実際のアプリ画面で確認できます。"
        />

        <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-3 lg:gap-6 lg:overflow-visible lg:px-0">
          {screens.map((screen) => (
            <article
              key={screen.src}
              className="w-[82vw] max-w-[360px] shrink-0 snap-center overflow-hidden rounded-[28px] border border-line bg-white shadow-soft lg:w-auto lg:max-w-none"
            >
              <Image
                src={screen.src}
                alt={screen.alt}
                width={1242}
                height={2688}
                sizes="(max-width: 1023px) 82vw, 33vw"
                className="h-auto w-full"
              />
            </article>
          ))}
        </div>

        <p className="mt-2 text-center text-xs font-bold text-muted lg:hidden">
          横にスワイプして、ほかの画面を見る
        </p>
      </div>
    </section>
  );
}
