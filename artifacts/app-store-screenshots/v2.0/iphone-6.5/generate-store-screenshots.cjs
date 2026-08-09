const path = require('node:path');
const fs = require('node:fs/promises');
const sharp = require('../../../../apps/web/node_modules/sharp');

const root = __dirname;
const sourceDir = path.join(root, 'source');
const outputDir = path.join(root, 'final');

const canvas = { width: 1242, height: 2688 };
const palette = {
  background: '#FFF8F0',
  ink: '#29231F',
  muted: '#71675F',
  accent: '#9F4D1F',
  pill: '#F3E1CF',
  border: '#E5D5C6',
};

const shots = [
  {
    source: '01-stock.png',
    output: '01-buy-timing.png',
    label: '在庫管理',
    title: '買い時が、ひと目でわかる',
    subtitle: '残り日数の近い用品を、ペットごとにまとめて確認',
    cropTop: 155,
    imageWidth: 1090,
    coverRects: [{ left: 1065, top: 1330, width: 141, height: 180 }],
  },
  {
    source: '02-learning.png',
    output: '02-auto-learning.png',
    label: '自動予測',
    title: '補充するだけで、買い時を学習',
    subtitle: '補充を2回記録すると、次の買い足し時期を自動予測',
    coverRects: [{ left: 0, top: 1375, width: 315, height: 160 }],
  },
  {
    source: '03-cost.png',
    output: '03-cost-overview.png',
    label: '費用管理',
    title: 'ペット用品の出費も見える',
    subtitle: '今月の実績と月額予測を、いつでも確認',
  },
  {
    source: '04-search.png',
    output: '04-product-search.png',
    label: '商品登録',
    title: '商品画像つきで、かんたん登録',
    subtitle: '商品名を検索して、画像つきの候補から選ぶだけ',
  },
  {
    source: '05-registration.png',
    output: '05-flexible-registration.png',
    label: '商品登録',
    title: '登録方法は、あなたに合わせて',
    subtitle: '日数・使用量・購入履歴から、好きな方法を選択',
    cropBottom: 125,
  },
  {
    source: '06-pets.png',
    output: '06-pet-profiles.png',
    label: 'ペット管理',
    title: '猫が主役。ほかのペットも一緒に。',
    subtitle: '8つのペット種別ごとに、プロフィールと在庫を管理',
    titleSize: 54,
    cropBottom: 145,
  },
];

function escapeXml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function headerSvg(shot) {
  const titleSize = shot.titleSize ?? 58;
  return Buffer.from(`
    <svg width="${canvas.width}" height="330" xmlns="http://www.w3.org/2000/svg">
      <rect x="64" y="38" width="236" height="54" rx="27" fill="${palette.pill}"/>
      <text x="182" y="75" text-anchor="middle"
        font-family="Hiragino Sans, Noto Sans CJK JP, sans-serif"
        font-size="27" font-weight="700" fill="${palette.accent}">${escapeXml(shot.label)}</text>
      <text x="64" y="172"
        font-family="Hiragino Sans, Noto Sans CJK JP, sans-serif"
        font-size="${titleSize}" font-weight="800" fill="${palette.ink}">${escapeXml(shot.title)}</text>
      <text x="66" y="247"
        font-family="Hiragino Sans, Noto Sans CJK JP, sans-serif"
        font-size="30" font-weight="500" fill="${palette.muted}">${escapeXml(shot.subtitle)}</text>
    </svg>
  `);
}

function roundedMask(width, height, radius) {
  return Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${width}" height="${height}" rx="${radius}" fill="white"/>
    </svg>
  `);
}

function shadowSvg(x, y, width, height, radius) {
  return Buffer.from(`
    <svg width="${canvas.width}" height="${canvas.height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="18"/>
        </filter>
      </defs>
      <rect x="${x}" y="${y + 14}" width="${width}" height="${height}" rx="${radius}"
        fill="#4D2F1D" opacity="0.16" filter="url(#shadow)"/>
      <rect x="${x - 1}" y="${y - 1}" width="${width + 2}" height="${height + 2}" rx="${radius + 1}"
        fill="none" stroke="${palette.border}" stroke-width="3"/>
    </svg>
  `);
}

async function prepareScreenshot(shot) {
  const sourcePath = path.join(sourceDir, shot.source);
  let image = sharp(sourcePath);
  if (shot.coverRects) {
    const overlays = shot.coverRects.map((rect) => ({
      input: Buffer.from(`
        <svg width="${rect.width}" height="${rect.height}" xmlns="http://www.w3.org/2000/svg">
          <rect width="${rect.width}" height="${rect.height}" fill="#FBF8F2"/>
        </svg>
      `),
      left: rect.left,
      top: rect.top,
    }));
    image = sharp(await image.composite(overlays).png().toBuffer());
  }

  const cropTop = shot.cropTop ?? 0;
  const cropBottom = shot.cropBottom ?? 0;
  if (cropTop || cropBottom) {
    image = image.extract({
      left: 0,
      top: cropTop,
      width: 1206,
      height: 2622 - cropTop - cropBottom,
    });
  }

  const width = shot.imageWidth ?? 1030;
  const raw = await image.resize({ width }).png().toBuffer();
  const meta = await sharp(raw).metadata();
  const radius = 42;
  const rounded = await sharp(raw)
    .composite([{ input: roundedMask(meta.width, meta.height, radius), blend: 'dest-in' }])
    .png()
    .toBuffer();

  return { image: rounded, width: meta.width, height: meta.height, radius };
}

async function createShot(shot) {
  const prepared = await prepareScreenshot(shot);
  const x = Math.round((canvas.width - prepared.width) / 2);
  const y = 330;

  await sharp({
    create: {
      width: canvas.width,
      height: canvas.height,
      channels: 3,
      background: palette.background,
    },
  })
    .composite([
      { input: headerSvg(shot), left: 0, top: 0 },
      { input: shadowSvg(x, y, prepared.width, prepared.height, prepared.radius), left: 0, top: 0 },
      { input: prepared.image, left: x, top: y },
    ])
    .flatten({ background: palette.background })
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toFile(path.join(outputDir, shot.output));
}

async function createContactSheet() {
  const thumbWidth = 310;
  const thumbHeight = 671;
  const gap = 28;
  const sheetWidth = thumbWidth * 3 + gap * 4;
  const sheetHeight = thumbHeight * 2 + gap * 3;
  const items = [];

  for (let index = 0; index < shots.length; index += 1) {
    const row = Math.floor(index / 3);
    const column = index % 3;
    const input = await sharp(path.join(outputDir, shots[index].output))
      .resize({ width: thumbWidth, height: thumbHeight, fit: 'cover' })
      .jpeg({ quality: 90 })
      .toBuffer();
    items.push({
      input,
      left: gap + column * (thumbWidth + gap),
      top: gap + row * (thumbHeight + gap),
    });
  }

  await sharp({
    create: {
      width: sheetWidth,
      height: sheetHeight,
      channels: 3,
      background: '#EADFD4',
    },
  })
    .composite(items)
    .jpeg({ quality: 92 })
    .toFile(path.join(outputDir, 'preview-contact-sheet.jpg'));
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true });
  for (const shot of shots) {
    await createShot(shot);
  }
  await createContactSheet();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
