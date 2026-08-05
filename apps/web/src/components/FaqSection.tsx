'use client';

import { useState } from 'react';
import { SectionTitle } from '@/components/SectionTitle';
import { trackEvent } from '@/lib/analytics';

const faqs = [
  [
    '残り日数はどう計算しますか？',
    '「補充履歴から推定」「だいたいの日数」「使用量から計算」「計算しない（日数表示なし）」の4つから選べます。自動推定では商品登録時の購入日を使わず、補充日が2件たまった時点から、その間隔で次の買い時を予測します。'
  ],
  [
    '用品はどう登録しますか？',
    '商品名・ブランド名から候補を探して選ぶか、手入力で登録できます。商品を選ぶと、名前、画像、カテゴリ、購入先など、利用できる情報が入力されます。'
  ],
  [
    '複数のペットにも対応していますか？',
    '猫、犬、うさぎ、小動物、鳥、観賞魚、爬虫類・両生類、昆虫の8区分に対応し、ペットごとに用品を分けて記録できます。同じ用品を複数のペットで共有する登録もできます。'
  ],
  [
    '無料とPlusの違いは？',
    '無料プランではペットプロフィール2件、在庫10件まで登録できます。Plusは登録数の上限を解除し、広告を非表示にします。家族共有、購入履歴、費用、複数端末同期は無料プランでも利用できます。共有中の新規追加にも、操作する端末のプラン上限が適用されます。'
  ],
  [
    'ゲストで始めて、家族と共有できますか？',
    'メールアドレスを入力せずゲストで始められます。共有スペースの作成にはGoogleまたはAppleログインが必要ですが、発行済みの共有コードへはゲストでも参加できます。参加すると、この端末のペット、在庫、購入履歴は共有データで上書きされます。'
  ],
  [
    'ペット用品はどこで購入しますか？',
    '登録した購入先URLを開くほか、URLがない場合も商品名からAmazon・楽天・Yahooの検索画面を開けます。購入と決済は各外部サイトで行います。商品リンクにはアフィリエイトリンクが含まれる場合がありますが、リンクの利用を理由に購入価格が上乗せされることはありません。'
  ],
  [
    '解約や購入復元はできますか？',
    'サブスクリプションの管理や解約はApp Storeから行えます。同じストアアカウントで購入したPlusは、アプリ内から復元できます。'
  ]
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
