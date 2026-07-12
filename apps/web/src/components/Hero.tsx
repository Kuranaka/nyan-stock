'use client';

import { MockPhone } from '@/components/MockPhone';
import { trackEvent } from '@/lib/analytics';

export function Hero() {
  return (
    <section className="overflow-hidden px-4 py-16 sm:px-6 lg:py-20">
      <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
        <div>
          <p className="mb-4 inline-flex rounded-full border border-line bg-white px-4 py-2 text-sm font-bold text-caramel">
            猫用品の在庫管理アプリ
          </p>
          <h1 className="max-w-3xl text-4xl font-black leading-tight text-ink sm:text-5xl lg:text-6xl">
            猫用品の買い忘れを、もうなくす。
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-muted">
            フード・猫砂・おやつの残り日数を管理して、なくなる前にお知らせ。いつもの商品もすぐ再購入できます。
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a
              href="#how-to-use"
              onClick={() => trackEvent('cta_click', { source: 'hero_primary' })}
              className="rounded-full bg-ink px-7 py-4 text-center font-bold text-white shadow-soft transition hover:bg-caramel"
            >
              使い方を見る
            </a>
            <a
              href="#features"
              onClick={() => trackEvent('cta_click', { source: 'hero_secondary' })}
              className="rounded-full border border-line bg-white px-7 py-4 text-center font-bold text-ink transition hover:border-caramel"
            >
              アプリの特徴を見る
            </a>
          </div>
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
