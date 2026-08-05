'use client';

import { MockPhone } from '@/components/MockPhone';
import { trackEvent } from '@/lib/analytics';
import { appStoreUrl } from '@/lib/site';

export function Hero() {
  return (
    <section className="overflow-hidden px-4 pb-16 pt-12 sm:px-6 sm:pt-16 lg:py-20">
      <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.08fr_0.92fr]">
        <div>
          <p className="mb-5 inline-flex rounded-full border border-caramel/25 bg-white px-4 py-2 text-sm font-bold text-caramel shadow-sm">
            Version 2.0｜猫を中心に、8区分のペットに対応
          </p>
          <h1 className="max-w-3xl text-balance text-4xl font-black leading-[1.16] text-ink sm:text-5xl lg:text-6xl">
            買い忘れを、
            <span className="text-caramel">補充するたび先回り。</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-muted">
            猫をはじめ、犬・うさぎ・鳥などの用品をペットごとに整理。補充履歴から次の買い時を学習し、残り日数・通知・購入履歴・費用までまとめて確認できます。
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a
              href={appStoreUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackEvent('external_link_click', { source: 'hero_app_store' })}
              className="rounded-full bg-ink px-7 py-4 text-center font-bold text-white shadow-soft transition hover:bg-caramel"
            >
              App Storeから無料で始める
            </a>
            <a
              href="#how-to-use"
              onClick={() => trackEvent('cta_click', { source: 'hero_secondary' })}
              className="rounded-full border border-line bg-white px-7 py-4 text-center font-bold text-ink transition hover:border-caramel"
            >
              使い方を見る
            </a>
          </div>
          <dl className="mt-8 grid max-w-2xl grid-cols-3 gap-3 border-t border-line pt-6">
            {[
              ['8区分', 'ペットに対応'],
              ['補充2回', 'から自動予測'],
              ['ひとつで', '在庫・費用・共有']
            ].map(([value, label]) => (
              <div key={value}>
                <dt className="text-lg font-black text-ink sm:text-xl">{value}</dt>
                <dd className="mt-1 text-xs leading-5 text-muted sm:text-sm">{label}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="relative">
          <div className="absolute inset-x-8 top-12 h-72 rounded-full bg-honey/70 blur-3xl" />
          <div className="relative">
            <MockPhone />
          </div>
        </div>
      </div>
    </section>
  );
}
