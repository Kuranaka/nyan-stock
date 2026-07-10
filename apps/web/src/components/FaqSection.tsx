'use client';

import { useState } from 'react';
import { SectionTitle } from '@/components/SectionTitle';
import { trackEvent } from '@/lib/analytics';

const faqs = [
  ['無料とPlusの違いは？', '無料プランでは猫プロフィール2匹、在庫10件まで登録できます。Plusでは登録数の上限がなくなり、広告が非表示になります。家族共有、購入履歴、月別費用レポート、複数端末同期は無料のまま使える予定です。'],
  ['解約や購入復元はできますか？', 'サブスクリプションの管理や解約はApp Storeのサブスクリプション管理画面から行えます。機種変更時や再インストール時は、アプリ内の購入復元からPlus状態を復元できる予定です。'],
  ['どの商品を購入できますか？', 'ユーザーが登録したAmazon・楽天・Yahooなどの商品URLを開けます。外部サイトでの価格、在庫、配送、返品は各サイトの表示と規約に従います。'],
  ['アプリ内で猫用品を決済しますか？', '猫用品の購入はアプリ内決済ではなく、外部サイトで行います。アプリ内課金はPlusプランの登録数上限解除と広告非表示のために使います。'],
  ['猫の健康診断もできますか？', 'いいえ。本アプリは獣医療上の診断や助言を行うものではありません。フードや体調に不安がある場合は獣医師に相談してください。'],
  ['多頭飼いにも対応しますか？', '猫ごとにプロフィールと在庫を分けて記録できます。無料プランは2匹まで、Plusは無制限の予定です。'],
  ['いつリリース予定ですか？', '現在開発中です。事前登録いただいた方には、リリース時にお知らせします。']
];

export function FaqSection() {
  const [openIndex, setOpenIndex] = useState(0);

  function toggle(index: number) {
    setOpenIndex((current) => (current === index ? -1 : index));
    trackEvent('faq_toggle', { question: faqs[index][0] });
  }

  return (
    <section id="faq" className="px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <SectionTitle title="FAQ" />
        <div className="space-y-3">
          {faqs.map(([question, answer], index) => (
            <div key={question} className="rounded-[24px] border border-line bg-white shadow-soft">
              <button
                type="button"
                onClick={() => toggle(index)}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-bold text-ink"
              >
                <span>Q. {question}</span>
                <span className="text-xl text-caramel">{openIndex === index ? '-' : '+'}</span>
              </button>
              {openIndex === index ? <p className="px-5 pb-5 text-sm leading-7 text-muted">A. {answer}</p> : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
