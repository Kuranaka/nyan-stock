import { appStoreUrl } from '@/lib/site';

export function FinalCtaSection() {
  return (
    <section className="px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-5xl overflow-hidden rounded-[32px] bg-ink px-6 py-10 text-center text-white shadow-soft sm:px-10 sm:py-14">
        <p className="mx-auto inline-flex rounded-full bg-honey px-4 py-2 text-xs font-black tracking-wide text-ink">
          VERSION 2.0
        </p>
        <h2 className="mx-auto mt-5 max-w-3xl text-3xl font-black leading-tight sm:text-4xl">
          いつもの補充から、次の買い時が見えてくる。
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-white/75 sm:text-base">
          猫を中心に8区分のペットに対応。用品をペットごとに整理して、補充履歴から買い足し時期と費用を見通せます。
        </p>
        <a
          href={appStoreUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-8 inline-flex w-full max-w-sm items-center justify-center rounded-full bg-caramel px-7 py-4 font-black text-white transition hover:bg-white hover:text-ink"
        >
          App Storeから無料で始める
        </a>
        <p className="mt-3 text-xs leading-5 text-white/60">
          Plusの価格と契約期間はApp Storeでご確認ください。
        </p>
      </div>
    </section>
  );
}
