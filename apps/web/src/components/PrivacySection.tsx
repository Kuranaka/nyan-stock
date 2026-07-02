import { SectionTitle } from '@/components/SectionTitle';

const points = [
  '初期版はログイン不要',
  '住所・電話番号・正確な位置情報は取得しない予定',
  '入力データは端末内保存を基本にする予定',
  '獣医療上の診断や助言は行わない',
  '気になる症状がある場合は獣医師に相談'
];

export function PrivacySection() {
  return (
    <section className="px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <SectionTitle title="安心して使える設計を目指しています" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {points.map((point) => (
            <div key={point} className="rounded-[24px] border border-line bg-white p-5 text-sm font-bold leading-6 text-ink shadow-soft">
              {point}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
