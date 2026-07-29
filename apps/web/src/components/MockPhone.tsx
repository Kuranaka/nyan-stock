type StockItem = {
  name: string;
  days: string;
  tone: 'danger' | 'warning' | 'success';
};

type MockPhoneProps = {
  title?: string;
  variant?: 'home' | 'detail' | 'history';
};

const items: StockItem[] = [
  { name: 'トイレ用品', days: '残り2日', tone: 'danger' },
  { name: 'ドライフード', days: '残り6日', tone: 'warning' },
  { name: 'おやつ', days: '残り18日', tone: 'success' }
];

const toneClass: Record<StockItem['tone'], string> = {
  danger: 'bg-danger text-white',
  warning: 'bg-warning text-ink',
  success: 'bg-success text-white'
};

export function MockPhone({ title = 'ミルクの在庫', variant = 'home' }: MockPhoneProps) {
  return (
    <div className="mx-auto w-full max-w-[310px] rounded-[2rem] border border-ink/10 bg-ink p-2 shadow-soft">
      <div className="rounded-[1.55rem] bg-cream p-4">
        <div className="mx-auto mb-4 h-1.5 w-16 rounded-full bg-ink/20" />
        <div className="rounded-[1.25rem] bg-white p-4">
          <p className="text-xs font-bold text-caramel">にゃんストック</p>
          <h3 className="mt-1 text-xl font-bold text-ink">{title}</h3>
          {variant === 'history' ? (
            <div className="mt-5 space-y-3">
              <div className="rounded-2xl bg-honey p-4">
                <p className="text-sm text-muted">今月のペット用品</p>
                <p className="mt-1 text-2xl font-bold text-ink">8,420円</p>
              </div>
              {['トイレ用品 1,980円', 'ドライフード 4,280円', 'おやつ 980円'].map((row) => (
                <div key={row} className="flex justify-between rounded-2xl border border-line px-4 py-3 text-sm">
                  <span>{row.split(' ')[0]}</span>
                  <span className="font-bold">{row.split(' ')[1]}</span>
                </div>
              ))}
            </div>
          ) : null}
          {variant === 'detail' ? (
            <div className="mt-5 space-y-4">
              <div className="rounded-2xl bg-sky p-4">
                <p className="text-sm text-muted">残り日数</p>
                <p className="mt-1 text-4xl font-bold text-ink">2日</p>
                <p className="mt-2 text-xs text-muted">推定終了日: 7月5日</p>
              </div>
              <button className="w-full rounded-full bg-caramel py-3 text-sm font-bold text-white">購入する</button>
              <button className="w-full rounded-full bg-mint py-3 text-sm font-bold text-ink">補充した</button>
            </div>
          ) : null}
          {variant === 'home' ? (
            <div className="mt-5 space-y-3">
              <p className="rounded-full bg-honey px-4 py-2 text-sm font-bold text-ink">もうすぐ切れる: 2件</p>
              {items.map((item) => (
                <div key={item.name} className="flex items-center justify-between rounded-2xl border border-line bg-cream px-4 py-3">
                  <span className="font-bold text-ink">{item.name}</span>
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${toneClass[item.tone]}`}>{item.days}</span>
                </div>
              ))}
              <div className="grid grid-cols-2 gap-2 pt-2">
                <button className="rounded-full bg-caramel py-3 text-sm font-bold text-white">購入する</button>
                <button className="rounded-full bg-mint py-3 text-sm font-bold text-ink">補充した</button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
