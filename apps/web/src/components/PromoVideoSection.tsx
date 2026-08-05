export function PromoVideoSection() {
  return (
    <section className="px-4 pb-12 sm:px-6 sm:pb-16" aria-label="紹介動画">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto w-full max-w-[320px] rounded-[32px] border border-line bg-white p-2 shadow-soft sm:p-2.5">
          <video
            className="aspect-[9/16] w-full rounded-[25px] bg-ink object-cover"
            controls
            playsInline
            preload="metadata"
            poster="/videos/nyanstock-ad-poster.jpg"
            aria-label="にゃんストックの機能を15秒で紹介する動画"
          >
            <source src="/videos/nyanstock-ad-15s.mp4" type="video/mp4" />
            お使いのブラウザでは動画を再生できません。
            <a href="/videos/nyanstock-ad-15s.mp4">動画ファイルを開く</a>
          </video>
        </div>
      </div>
    </section>
  );
}
