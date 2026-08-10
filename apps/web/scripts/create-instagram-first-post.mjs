import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(scriptDir, '..');
const repoDir = path.resolve(webDir, '../..');
const outputDir = path.join(webDir, 'public/social/instagram/first-post');
const generatedCover = path.join(outputDir, 'cover-illustration-source.png');
const iconPath = path.join(repoDir, 'apps/mobile/assets/icon.png');
const stockScreenshot = path.join(webDir, 'public/screenshots/v2.0/01-buy-timing.png');
const costScreenshot = path.join(webDir, 'public/screenshots/v2.0/03-cost-overview.png');

const width = 1080;
const height = 1350;
const cream = '#fff8ef';
const ink = '#2b241f';
const muted = '#766b63';
const caramel = '#9f4c1f';
const pale = '#f5dfc8';
const honey = '#ffb23f';
const font = "'Hiragino Sans','Hiragino Kaku Gothic ProN','Noto Sans CJK JP',sans-serif";

await mkdir(outputDir, { recursive: true });

function svg(content, background = cream) {
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect width="${width}" height="${height}" fill="${background}"/>
      <style>
        text { font-family: ${font}; fill: ${ink}; }
        .heavy { font-weight: 900; }
        .bold { font-weight: 700; }
        .white { fill: #ffffff !important; }
        .pale-text { fill: #f8dec5 !important; }
        .muted { fill: ${muted} !important; }
        .caramel-text { fill: ${caramel} !important; }
      </style>
      ${content}
    </svg>
  `);
}

async function writeSlide(name, base, composites = []) {
  await sharp(base)
    .resize(width, height)
    .composite(composites)
    .png({ compressionLevel: 9 })
    .toFile(path.join(outputDir, name));
}

function roundedMask(w, h, radius = 42) {
  return Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><rect width="${w}" height="${h}" rx="${radius}" fill="white"/></svg>`);
}

async function cropRounded(input, w, h, position = 'north') {
  return sharp(input)
    .resize(w, h, { fit: 'cover', position })
    .composite([{ input: roundedMask(w, h), blend: 'dest-in' }])
    .png()
    .toBuffer();
}

const coverBackground = await sharp(generatedCover)
  .resize(width, height, { fit: 'contain', background: cream })
  .png()
  .toBuffer();
const smallIcon = await cropRounded(iconPath, 82, 82, 'centre');
const coverOverlay = svg(`
  <defs>
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff8ef" stop-opacity="0.98"/>
      <stop offset="0.62" stop-color="#fff8ef" stop-opacity="0.76"/>
      <stop offset="1" stop-color="#fff8ef" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="1080" height="620" fill="url(#fade)"/>
  <rect x="72" y="58" width="342" height="80" rx="40" fill="#ffffff" fill-opacity="0.92"/>
  <text x="188" y="110" class="bold" font-size="30">にゃんストック</text>
  <text x="72" y="232" class="heavy" font-size="77">
    <tspan x="72" dy="0">ペット用品の</tspan>
    <tspan x="72" dy="92">買い忘れを、</tspan>
    <tspan x="72" dy="92" class="caramel-text">もうなくす。</tspan>
  </text>
  <text x="74" y="528" class="muted" font-size="32">在庫・通知・購入履歴・費用をひとつに</text>
`, 'transparent');
await writeSlide('01-cover.png', coverBackground, [
  { input: coverOverlay },
  { input: smallIcon, left: 84, top: 57 },
]);

const problemBase = svg(`
  <circle cx="940" cy="105" r="190" fill="#ffe1a9" fill-opacity="0.55"/>
  <circle cx="90" cy="1260" r="220" fill="#f0c9a9" fill-opacity="0.45"/>
  <rect x="72" y="70" width="188" height="54" rx="27" fill="${pale}"/>
  <text x="166" y="107" text-anchor="middle" class="bold" font-size="27" fill="${caramel}">よくある悩み</text>
  <text x="72" y="215" class="heavy" font-size="66">こんなこと、</text>
  <text x="72" y="292" class="heavy" font-size="66">ありませんか？</text>

  <rect x="72" y="380" width="936" height="174" rx="38" fill="#ffffff" stroke="#ead8c6" stroke-width="3"/>
  <circle cx="164" cy="467" r="52" fill="#fff0d4"/>
  <text x="164" y="482" text-anchor="middle" font-size="48">①</text>
  <text x="242" y="454" class="bold" font-size="37">フードがいつ切れるか</text>
  <text x="242" y="503" class="bold" font-size="37">分からない</text>

  <rect x="72" y="584" width="936" height="174" rx="38" fill="#ffffff" stroke="#ead8c6" stroke-width="3"/>
  <circle cx="164" cy="671" r="52" fill="#fde1dd"/>
  <text x="164" y="686" text-anchor="middle" font-size="48">②</text>
  <text x="242" y="658" class="bold" font-size="37">猫砂や日用品を</text>
  <text x="242" y="707" class="bold" font-size="37">買い忘れてしまう</text>

  <rect x="72" y="788" width="936" height="174" rx="38" fill="#ffffff" stroke="#ead8c6" stroke-width="3"/>
  <circle cx="164" cy="875" r="52" fill="#e8e4d5"/>
  <text x="164" y="890" text-anchor="middle" font-size="48">③</text>
  <text x="242" y="862" class="bold" font-size="37">毎月いくら使ったか</text>
  <text x="242" y="911" class="bold" font-size="37">把握しづらい</text>

  <rect x="72" y="1054" width="936" height="178" rx="44" fill="${ink}"/>
  <text x="540" y="1128" text-anchor="middle" class="heavy white" font-size="43">その管理、ひとつに</text>
  <text x="540" y="1183" text-anchor="middle" class="bold pale-text" font-size="31">まとめられます。</text>
`);
await writeSlide('02-problem.png', problemBase);

const stockShot = await cropRounded(stockScreenshot, 748, 900, 'north');
const stockBase = svg(`
  <rect x="72" y="64" width="188" height="54" rx="27" fill="${pale}"/>
  <text x="166" y="101" text-anchor="middle" class="bold" font-size="27" fill="${caramel}">在庫管理</text>
  <text x="72" y="200" class="heavy" font-size="64">買い時が、</text>
  <text x="72" y="276" class="heavy" font-size="64">ひと目でわかる</text>
  <text x="74" y="334" font-size="29" fill="${muted}">残り日数の近い用品を、ペットごとに確認</text>
  <rect x="142" y="392" width="796" height="948" rx="54" fill="#ffffff" stroke="#e7d7c7" stroke-width="3"/>
`);
await writeSlide('03-stock.png', stockBase, [{ input: stockShot, left: 166, top: 416 }]);

const costShot = await cropRounded(costScreenshot, 748, 900, 'north');
const costBase = svg(`
  <rect x="72" y="64" width="188" height="54" rx="27" fill="${pale}"/>
  <text x="166" y="101" text-anchor="middle" class="bold" font-size="27" fill="${caramel}">費用管理</text>
  <text x="72" y="200" class="heavy" font-size="64">ペット用品の</text>
  <text x="72" y="276" class="heavy" font-size="64">出費も見える</text>
  <text x="74" y="334" font-size="29" fill="${muted}">今月の実績と月額予測を、いつでも確認</text>
  <rect x="142" y="392" width="796" height="948" rx="54" fill="#ffffff" stroke="#e7d7c7" stroke-width="3"/>
`);
await writeSlide('04-cost.png', costBase, [{ input: costShot, left: 166, top: 416 }]);

const ctaIcon = await cropRounded(iconPath, 300, 300, 'centre');
const ctaBase = svg(`
  <defs>
    <radialGradient id="glow" cx="50%" cy="32%" r="72%">
      <stop offset="0" stop-color="#fff0ce"/>
      <stop offset="1" stop-color="#f3c37e"/>
    </radialGradient>
  </defs>
  <rect width="1080" height="1350" fill="url(#glow)"/>
  <circle cx="110" cy="170" r="120" fill="#ffffff" fill-opacity="0.22"/>
  <circle cx="1005" cy="1160" r="190" fill="#ffffff" fill-opacity="0.18"/>
  <text x="540" y="540" text-anchor="middle" class="heavy" font-size="69">今日から、買い時を</text>
  <text x="540" y="626" text-anchor="middle" class="heavy caramel-text" font-size="69">見える化。</text>
  <text x="540" y="712" text-anchor="middle" class="bold" font-size="32" fill="${muted}">猫を中心に、8区分のペットに対応</text>
  <rect x="130" y="800" width="820" height="118" rx="59" fill="${ink}"/>
  <text x="540" y="875" text-anchor="middle" class="heavy white" font-size="39">App Storeから無料で始める</text>
  <text x="540" y="980" text-anchor="middle" class="bold" font-size="29" fill="${ink}">プロフィールのリンクからダウンロード</text>
  <text x="540" y="1232" text-anchor="middle" class="heavy" font-size="40">にゃんストック</text>
  <text x="540" y="1282" text-anchor="middle" font-size="28" fill="${muted}">ペット用品の在庫管理アプリ</text>
`);
await writeSlide('05-cta.png', ctaBase, [{ input: ctaIcon, left: 390, top: 166 }]);

console.log(outputDir);
