import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { config } from '../config.js';
import { ProductMaster } from '../types.js';

const reviewPagePath = path.join(path.dirname(config.outputJsonPath), 'productMaster.review.html');

async function main() {
  const products = JSON.parse(await readFile(config.outputJsonPath, 'utf8')) as ProductMaster[];
  await mkdir(path.dirname(reviewPagePath), { recursive: true });
  await writeFile(reviewPagePath, buildReviewPage(products), 'utf8');
  console.log(`[review:products] exported ${products.length} products to ${reviewPagePath}`);
}

function buildReviewPage(products: ProductMaster[]): string {
  const data = JSON.stringify(products).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ProductMaster Review</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f7f5ef;
      --panel: #fffdf8;
      --line: #ded7c8;
      --text: #25211a;
      --muted: #70685b;
      --accent: #2f7d68;
      --warn: #9c6b16;
      --bad: #b04444;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 14px;
    }
    header {
      position: sticky;
      top: 0;
      z-index: 2;
      border-bottom: 1px solid var(--line);
      background: rgba(247, 245, 239, 0.96);
      padding: 14px 18px;
    }
    h1 { margin: 0 0 10px; font-size: 20px; }
    .toolbar {
      display: grid;
      grid-template-columns: minmax(180px, 2fr) repeat(4, minmax(120px, 1fr)) auto;
      gap: 8px;
      align-items: end;
    }
    label { display: grid; gap: 4px; color: var(--muted); font-size: 12px; font-weight: 700; }
    input, select, button {
      min-height: 38px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      color: var(--text);
      padding: 8px 10px;
      font: inherit;
    }
    button {
      cursor: pointer;
      font-weight: 800;
    }
    main { padding: 16px 18px 32px; }
    .summary {
      display: grid;
      grid-template-columns: repeat(6, minmax(120px, 1fr));
      gap: 8px;
      margin-bottom: 12px;
    }
    .metric, .card {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
    }
    .metric { padding: 10px; }
    .metric strong { display: block; font-size: 19px; }
    .metric span { color: var(--muted); font-size: 12px; }
    .list { display: grid; gap: 8px; }
    .card {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 240px;
      gap: 12px;
      padding: 12px;
    }
    .name { margin: 0 0 8px; font-size: 15px; line-height: 1.45; }
    .meta, .badges { display: flex; flex-wrap: wrap; gap: 6px; }
    .badge {
      border: 1px solid var(--line);
      border-radius: 999px;
      background: #f4efe3;
      padding: 3px 8px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
    }
    .badge.bad { color: var(--bad); border-color: #e2b8b8; background: #fff3f3; }
    .badge.warn { color: var(--warn); border-color: #e5cf99; background: #fff8e5; }
    .badge.good { color: var(--accent); border-color: #acd4c8; background: #edf8f4; }
    .review-controls {
      display: grid;
      gap: 8px;
      align-content: start;
    }
    textarea {
      min-height: 74px;
      resize: vertical;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 8px;
      font: inherit;
    }
    .empty {
      border: 1px dashed var(--line);
      border-radius: 8px;
      padding: 24px;
      color: var(--muted);
      text-align: center;
    }
    @media (max-width: 900px) {
      .toolbar, .summary, .card { grid-template-columns: 1fr; }
      header { position: static; }
    }
  </style>
</head>
<body>
  <header>
    <h1>ProductMaster Review</h1>
    <div class="toolbar">
      <label>検索<input id="query" placeholder="商品名・ブランド・JAN" /></label>
      <label>カテゴリ<select id="category"></select></label>
      <label>状態<select id="status"></select></label>
      <label>品質<select id="quality"></select></label>
      <label>並び順<select id="sort"></select></label>
      <button id="export">レビュー結果を書き出す</button>
    </div>
  </header>
  <main>
    <section id="summary" class="summary"></section>
    <section id="list" class="list"></section>
  </main>
  <script>
    const products = ${data};
    const labels = {
      dry_food: 'ドライフード',
      wet_food: 'ウェットフード',
      treat: 'おやつ',
      cat_litter: '猫砂',
      toilet_sheet: 'トイレシート',
      supplement: 'サプリ',
      medicine: '薬',
      care: 'ケア用品',
      other: 'その他',
    };
    const storageKey = 'nyan-stock:product-master-review';
    const state = JSON.parse(localStorage.getItem(storageKey) || '{}');
    const controls = {
      query: document.querySelector('#query'),
      category: document.querySelector('#category'),
      status: document.querySelector('#status'),
      quality: document.querySelector('#quality'),
      sort: document.querySelector('#sort'),
      list: document.querySelector('#list'),
      summary: document.querySelector('#summary'),
      export: document.querySelector('#export'),
    };

    initSelect(controls.category, [['all', 'すべて'], ...Object.entries(labels)]);
    initSelect(controls.status, [['all', 'すべて'], ['unreviewed', '未レビュー'], ['approved', '採用'], ['needs_fix', '要修正'], ['rejected', '除外']]);
    initSelect(controls.quality, [['all', 'すべて'], ['low_confidence', '低信頼度'], ['missing_brand', 'ブランドなし'], ['missing_amount', '内容量なし'], ['missing_jan', 'JAN/GTINなし'], ['missing_image', '画像なし'], ['other', 'カテゴリその他'], ['noise', 'ノイズあり']]);
    initSelect(controls.sort, [['confidence_asc', '信頼度 低い順'], ['confidence_desc', '信頼度 高い順'], ['name_asc', '商品名順'], ['updated_desc', '更新日 新しい順']]);

    Object.values(controls).forEach((control) => {
      if (control && control.tagName !== 'SECTION' && control.id !== 'export') {
        control.addEventListener('input', render);
      }
    });
    controls.export.addEventListener('click', exportReview);
    render();

    function initSelect(select, options) {
      select.innerHTML = options.map(([value, label]) => '<option value="' + value + '">' + label + '</option>').join('');
    }

    function render() {
      const rows = filteredProducts();
      renderSummary(rows);
      controls.list.innerHTML = rows.length ? rows.map(renderProduct).join('') : '<div class="empty">該当する商品はありません</div>';
      document.querySelectorAll('[data-status]').forEach((select) => {
        select.addEventListener('change', (event) => updateReview(event.target.dataset.id, { status: event.target.value }));
      });
      document.querySelectorAll('[data-note]').forEach((textarea) => {
        textarea.addEventListener('input', (event) => updateReview(event.target.dataset.id, { note: event.target.value }));
      });
    }

    function filteredProducts() {
      const query = normalize(controls.query.value);
      return products
        .filter((product) => {
          const review = state[product.id] || {};
          if (controls.category.value !== 'all' && product.category !== controls.category.value) return false;
          if (controls.status.value === 'unreviewed' && review.status) return false;
          if (controls.status.value !== 'all' && controls.status.value !== 'unreviewed' && review.status !== controls.status.value) return false;
          if (!matchesQuality(product, controls.quality.value)) return false;
          if (!query) return true;
          const target = normalize([product.name, product.normalizedName, product.brand, product.janCode, product.gtin, ...(product.searchKeywords || [])].filter(Boolean).join(' '));
          return target.includes(query);
        })
        .sort(compareProducts);
    }

    function matchesQuality(product, quality) {
      if (quality === 'all') return true;
      if (quality === 'low_confidence') return product.confidence < 50;
      if (quality === 'missing_brand') return !product.brand;
      if (quality === 'missing_amount') return product.amount === undefined || !product.unit;
      if (quality === 'missing_jan') return !product.janCode && !product.gtin;
      if (quality === 'missing_image') return !product.imageUrl && !(product.packageImageUrls || []).length;
      if (quality === 'other') return product.category === 'other';
      if (quality === 'noise') return /(送料無料|クーポン|ポイント|最安値|税込|あす楽|即納|まとめ買い|最大\\d+円)/.test(product.name);
      return true;
    }

    function compareProducts(a, b) {
      if (controls.sort.value === 'confidence_desc') return b.confidence - a.confidence;
      if (controls.sort.value === 'name_asc') return a.name.localeCompare(b.name, 'ja');
      if (controls.sort.value === 'updated_desc') return String(b.updatedAt).localeCompare(String(a.updatedAt));
      return a.confidence - b.confidence;
    }

    function renderSummary(rows) {
      const reviewed = Object.values(state).filter((review) => review.status).length;
      const approved = Object.values(state).filter((review) => review.status === 'approved').length;
      const needsFix = Object.values(state).filter((review) => review.status === 'needs_fix').length;
      const rejected = Object.values(state).filter((review) => review.status === 'rejected').length;
      controls.summary.innerHTML = [
        metric(products.length, '全件'),
        metric(rows.length, '表示中'),
        metric(reviewed, 'レビュー済み'),
        metric(approved, '採用'),
        metric(needsFix, '要修正'),
        metric(rejected, '除外'),
      ].join('');
    }

    function metric(value, label) {
      return '<div class="metric"><strong>' + value + '</strong><span>' + label + '</span></div>';
    }

    function renderProduct(product) {
      const review = state[product.id] || {};
      const providers = Array.from(new Set((product.sources || []).map((source) => source.provider))).join(', ');
      const badges = [
        badge(labels[product.category] || product.category, product.category === 'other' ? 'bad' : ''),
        product.brand ? badge(product.brand, 'good') : badge('ブランドなし', 'warn'),
        product.amount !== undefined && product.unit ? badge(product.amount + product.unit, '') : badge('内容量なし', 'warn'),
        product.janCode || product.gtin ? badge('JAN/GTINあり', 'good') : badge('JAN/GTINなし', 'warn'),
        product.imageUrl || (product.packageImageUrls || []).length ? badge('画像あり', 'good') : badge('画像なし', 'warn'),
        badge('信頼度 ' + product.confidence, product.confidence >= 80 ? 'good' : product.confidence < 50 ? 'warn' : ''),
        providers ? badge(providers, '') : badge('sourceなし', 'bad'),
      ].join('');
      return '<article class="card">' +
        '<div>' +
          '<h2 class="name">' + escapeHtml(product.name) + '</h2>' +
          '<div class="badges">' + badges + '</div>' +
          '<p class="meta">' + escapeHtml(product.id) + '</p>' +
        '</div>' +
        '<div class="review-controls">' +
          '<select data-status data-id="' + escapeHtml(product.id) + '">' +
            option('', '未レビュー', review.status) +
            option('approved', '採用', review.status) +
            option('needs_fix', '要修正', review.status) +
            option('rejected', '除外', review.status) +
          '</select>' +
          '<textarea data-note data-id="' + escapeHtml(product.id) + '" placeholder="修正メモ">' + escapeHtml(review.note || '') + '</textarea>' +
        '</div>' +
      '</article>';
    }

    function badge(text, tone) {
      return '<span class="badge ' + tone + '">' + escapeHtml(text) + '</span>';
    }

    function option(value, label, current) {
      return '<option value="' + value + '"' + (value === (current || '') ? ' selected' : '') + '>' + label + '</option>';
    }

    function updateReview(id, patch) {
      state[id] = { ...(state[id] || {}), ...patch };
      if (!state[id].status && !state[id].note) delete state[id];
      localStorage.setItem(storageKey, JSON.stringify(state));
      renderSummary(filteredProducts());
    }

    function exportReview() {
      const reviewedAt = new Date().toISOString();
      const payload = {
        reviewedAt,
        totalProducts: products.length,
        decisions: Object.entries(state).map(([productId, review]) => ({ productId, ...review })),
      };
      const blob = new Blob([JSON.stringify(payload, null, 2) + '\\n'], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'productMaster.review-decisions.json';
      anchor.click();
      URL.revokeObjectURL(url);
    }

    function normalize(value) {
      return String(value || '').normalize('NFKC').toLowerCase().replace(/[\\s\\-_/・,，.。()（）[\\]【】"'“”]/g, '');
    }

    function escapeHtml(value) {
      return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    }
  </script>
</body>
</html>`;
}

void main();
