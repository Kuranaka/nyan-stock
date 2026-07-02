'use client';

import { useState } from 'react';
import { SectionTitle } from '@/components/SectionTitle';
import { trackEvent } from '@/lib/analytics';

const faqs = [
  ['アプリは無料ですか？', '初期版は無料で使える形を予定しています。一部機能は将来的に有料化する可能性があります。'],
  ['どの商品を購入できますか？', '初期版では、ユーザーが登録したAmazon・楽天・Yahooなどの商品URLを開ける形を想定しています。'],
  ['アプリ内で決済しますか？', '初期版ではアプリ内決済ではなく、外部サイトで購入する形を予定しています。'],
  ['猫の健康診断もできますか？', 'いいえ。本アプリは獣医療上の診断や助言を行うものではありません。フードや体調に不安がある場合は獣医師に相談してください。'],
  ['多頭飼いにも対応しますか？', '将来的に対応予定です。初期版ではまず1匹の管理を使いやすくすることを優先します。'],
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
