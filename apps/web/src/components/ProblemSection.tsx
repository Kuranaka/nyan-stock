import { SectionTitle } from '@/components/SectionTitle';

const problems = [
  '気づいたら猫砂が残り少ない',
  'いつものフードを買い忘れた',
  'おやつやサプリの残量が分からない',
  '多頭飼いで消費ペースが読めない',
  '前回いつ買ったか覚えていない',
  '毎月の猫用品代を把握できていない'
];

export function ProblemSection() {
  return (
    <section className="px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <SectionTitle title="こんなこと、ありませんか？" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {problems.map((problem) => (
            <div key={problem} className="rounded-[28px] border border-line bg-white p-5 text-base font-bold text-ink shadow-soft">
              <span className="mr-2 text-caramel">●</span>
              {problem}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
