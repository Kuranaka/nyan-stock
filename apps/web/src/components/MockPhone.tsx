type StockItem = {
  name: string;
  detail: string;
  status: string;
  tone: 'danger' | 'learning' | 'quiet';
};

type MockPhoneProps = {
  title?: string;
  variant?: 'home' | 'detail' | 'history';
};

const items: StockItem[] = [
  { name: 'いつものドライフード', detail: 'フード・Milk', status: '残り2日', tone: 'danger' },
  { name: '猫砂', detail: 'トイレ用品・Milk', status: '学習中', tone: 'learning' },
  { name: 'おやつ', detail: 'おやつ・Milk', status: '日数表示なし', tone: 'quiet' }
];

const toneClass: Record<StockItem['tone'], string> = {
  danger: 'bg-[#FCE7E5] text-danger',
  learning: 'bg-honey text-ink',
  quiet: 'bg-[#F3EFE9] text-muted'
};

export function MockPhone({ title = '在庫', variant = 'home' }: MockPhoneProps) {
  return (
    <div className="mx-auto w-full max-w-[310px] rounded-[2rem] border border-ink/10 bg-ink p-2 shadow-soft">
      <div className="rounded-[1.55rem] bg-cream p-4">
        <div className="mx-auto mb-4 h-1.5 w-16 rounded-full bg-ink/20" />
        <div className="rounded-[1.25rem] bg-white p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-caramel">にゃんストック 2.0</p>
              <h3 className="mt-1 text-xl font-black text-ink">{title}</h3>
            </div>
            <span className="rounded-full bg-honey px-3 py-1.5 text-xs font-bold text-ink">＋ 追加</span>
          </div>
          {variant === 'history' ? (
            <div className="mt-5 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-2xl bg-honey p-3">
                  <p className="text-[10px] text-muted">今月ここまで</p>
                  <p className="mt-1 text-lg font-black text-ink">8,420円</p>
                </div>
                <div className="rounded-2xl bg-sky p-3">
                  <p className="text-[10px] text-muted">今後30日</p>
                  <p className="mt-1 text-lg font-black text-ink">6,260円</p>
                </div>
              </div>
              {['7月 8,420円', '6月 7,680円', '5月 8,100円'].map((row) => (
                <div key={row} className="flex justify-between rounded-2xl border border-line px-4 py-3 text-sm">
                  <span>{row.split(' ')[0]}</span>
                  <span className="font-bold">{row.split(' ')[1]}</span>
                </div>
              ))}
            </div>
          ) : null}
          {variant === 'detail' ? (
            <div className="mt-5 space-y-4">
              <div className="rounded-2xl bg-honey p-4">
                <p className="text-sm font-bold text-ink">補充から自動で学習</p>
                <p className="mt-2 text-xs leading-5 text-muted">補充記録が2件たまると、次の買い時を予測します。</p>
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-line p-4">
                <div>
                  <p className="text-xs text-muted">現在の状態</p>
                  <p className="mt-1 font-black text-ink">学習中</p>
                </div>
                <span className="rounded-full bg-honey px-3 py-1 text-xs font-bold">1 / 2件</span>
              </div>
              <div className="w-full rounded-full bg-caramel py-3 text-center text-sm font-bold text-white">補充を記録</div>
            </div>
          ) : null}
          {variant === 'home' ? (
            <div className="mt-5 space-y-3">
              <div>
                <p className="text-[11px] font-bold text-muted">表示するペット</p>
                <span className="mt-2 inline-flex items-center gap-2 rounded-full bg-ink px-3 py-2 text-xs font-bold text-white">
                  <span className="rounded-full bg-white p-1">🐱</span> Milk
                </span>
              </div>
              <div className="flex gap-1.5 overflow-hidden text-[10px] font-bold">
                <span className="rounded-full bg-ink px-3 py-2 text-white">すべて</span>
                <span className="rounded-full border border-line px-3 py-2 text-ink">要対応</span>
                <span className="rounded-full border border-line px-3 py-2 text-ink">学習中</span>
              </div>
              {items.map((item) => (
                <div key={item.name} className="flex items-center justify-between gap-2 rounded-2xl border border-line bg-cream px-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-ink">{item.name}</p>
                    <p className="mt-1 truncate text-[10px] text-muted">{item.detail}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${toneClass[item.tone]}`}>{item.status}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
