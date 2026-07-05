import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { config } from '../config.js';
import { loadProductMasters } from '../repositories/productRepository.js';
import { ProductMaster } from '../types.js';

const reviewPagePath = path.join(path.dirname(config.outputJsonPath), 'productMaster.review.html');
const seedCsvPath = path.join(
  config.repositoryRoot,
  'services',
  'product-importer',
  'data',
  'seed',
  'cat_products_seed.csv',
);

type AmazonReviewLink = {
  searchQuery?: string;
  searchUrl?: string;
  searchUrlAllDepartments?: string;
  productUrl?: string;
  asin?: string;
  matchStatus?: string;
  manualReviewNote?: string;
};

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const products = options.localJson ? await loadFromLocalJson() : await loadProductMasters();
  const amazonReviewLinks = await loadAmazonReviewLinks();
  await mkdir(path.dirname(reviewPagePath), { recursive: true });
  await writeFile(reviewPagePath, buildReviewPage(products, amazonReviewLinks), 'utf8');
  console.log(
    `[review:products] exported ${products.length} products to ${reviewPagePath} source=${options.localJson ? 'local-json' : 'repository'}`,
  );
}

function parseOptions(args: string[]): { localJson: boolean } {
  return {
    localJson: args.includes('--local-json'),
  };
}

async function loadFromLocalJson(): Promise<ProductMaster[]> {
  const products = JSON.parse(await readFile(config.outputJsonPath, 'utf8')) as ProductMaster[];
  return products;
}

async function loadAmazonReviewLinks(): Promise<Record<string, AmazonReviewLink>> {
  const csv = await readFile(seedCsvPath, 'utf8');
  return Object.fromEntries(
    parseCsv(csv)
      .filter((row) => row.product_id && (row.amazon_search_url || row.amazon_product_url))
      .map((row) => [
        row.product_id,
        {
          searchQuery: row.amazon_search_query || undefined,
          searchUrl: row.amazon_search_url || undefined,
          searchUrlAllDepartments: row.amazon_search_url_all_departments || undefined,
          productUrl: row.amazon_product_url || undefined,
          asin: row.amazon_asin || undefined,
          matchStatus: row.amazon_match_status || undefined,
          manualReviewNote: row.manual_review_note || undefined,
        },
      ]),
  );
}

function buildReviewPage(products: ProductMaster[], amazonReviewLinks: Record<string, AmazonReviewLink>): string {
  const data = JSON.stringify(products).replace(/</g, '\\u003c');
  const amazonLinksData = JSON.stringify(amazonReviewLinks).replace(/</g, '\\u003c');
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
    .add-product {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      display: grid;
      gap: 10px;
      margin-bottom: 12px;
      padding: 12px;
    }
    .add-product h2 {
      font-size: 15px;
      margin: 0;
    }
    .add-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(140px, 1fr));
      gap: 8px;
    }
    .add-actions {
      align-items: center;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .added-list {
      display: grid;
      gap: 6px;
    }
    .added-item {
      align-items: center;
      border-top: 1px solid var(--line);
      display: grid;
      gap: 8px;
      grid-template-columns: minmax(0, 1fr) auto;
      padding-top: 8px;
    }
    .summary {
      display: grid;
      grid-template-columns: repeat(7, minmax(110px, 1fr));
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
    .meta { color: var(--muted); font-size: 12px; }
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
    .image-review {
      display: grid;
      gap: 8px;
      margin-top: 10px;
    }
    .image-review-title {
      align-items: center;
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 800;
    }
    .image-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(168px, 1fr));
      gap: 12px;
    }
    .image-candidate {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #f4efe3;
      overflow: hidden;
    }
    .image-candidate img {
      display: block;
      width: 100%;
      aspect-ratio: 4 / 3;
      object-fit: contain;
      background: white;
    }
    .image-candidate footer {
      display: grid;
      gap: 6px;
      padding: 8px;
    }
    .image-candidate button {
      min-height: 34px;
      padding: 6px 8px;
      font-size: 12px;
    }
    .image-candidate.selected {
      border-color: var(--accent);
      box-shadow: 0 0 0 2px rgba(47, 125, 104, 0.14);
    }
    .image-url {
      color: var(--muted);
      font-size: 11px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .image-empty {
      border: 1px dashed var(--line);
      border-radius: 8px;
      color: var(--muted);
      padding: 10px;
    }
    .review-controls {
      display: grid;
      gap: 8px;
      align-content: start;
    }
    .edit-group {
      border-top: 1px solid var(--line);
      display: grid;
      gap: 6px;
      padding-top: 8px;
    }
    .edit-group-title {
      color: var(--muted);
      font-size: 12px;
      font-weight: 800;
    }
    .edit-group input {
      width: 100%;
    }
    .link-row {
      display: grid;
      gap: 6px;
    }
    .link-row-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .quick-links {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .quick-link {
      align-items: center;
      border: 1px solid var(--line);
      border-radius: 8px;
      color: var(--accent);
      display: inline-flex;
      font-size: 12px;
      font-weight: 800;
      min-height: 34px;
      padding: 6px 8px;
      text-decoration: none;
    }
    .quick-link:hover {
      background: #edf8f4;
      border-color: #acd4c8;
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
      .toolbar, .add-grid, .summary, .card, .added-item { grid-template-columns: 1fr; }
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
    <section class="add-product">
      <h2>商品追加</h2>
      <div class="add-grid">
        <label>商品名<input id="new-name" placeholder="商品名" /></label>
        <label>ブランド<input id="new-brand" placeholder="ブランド" /></label>
        <label>メーカー<input id="new-maker" placeholder="メーカー" /></label>
        <label>カテゴリ<select id="new-category"></select></label>
        <label>内容量<input id="new-amount" type="number" min="0" step="0.01" placeholder="例: 1.5" /></label>
        <label>単位<select id="new-unit"></select></label>
        <label>JAN<input id="new-jan" placeholder="JAN/GTIN" /></label>
        <label>代表画像URL<input id="new-image-url" placeholder="https://..." /></label>
        <label>楽天URL<input id="new-rakuten-url" placeholder="https://..." /></label>
        <label>Yahoo URL<input id="new-yahoo-url" placeholder="https://..." /></label>
        <label>Amazon URL<input id="new-amazon-url" placeholder="https://..." /></label>
        <label>公式URL<input id="new-official-url" placeholder="https://..." /></label>
      </div>
      <div class="add-actions">
        <button id="add-product" type="button">追加</button>
        <span class="meta">追加した商品はレビュー結果JSONに含まれ、apply時にProductMasterへ追加されます。</span>
      </div>
      <div id="added-list" class="added-list"></div>
    </section>
    <section id="summary" class="summary"></section>
    <section id="list" class="list"></section>
  </main>
  <script>
    const products = ${data};
    const amazonReviewLinks = ${amazonLinksData};
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
    const additionsStorageKey = 'nyan-stock:product-master-review:additions';
    const state = JSON.parse(localStorage.getItem(storageKey) || '{}');
    const additions = JSON.parse(localStorage.getItem(additionsStorageKey) || '[]');
    const controls = {
      query: document.querySelector('#query'),
      category: document.querySelector('#category'),
      status: document.querySelector('#status'),
      quality: document.querySelector('#quality'),
      sort: document.querySelector('#sort'),
      newName: document.querySelector('#new-name'),
      newBrand: document.querySelector('#new-brand'),
      newMaker: document.querySelector('#new-maker'),
      newCategory: document.querySelector('#new-category'),
      newAmount: document.querySelector('#new-amount'),
      newUnit: document.querySelector('#new-unit'),
      newJan: document.querySelector('#new-jan'),
      newImageUrl: document.querySelector('#new-image-url'),
      newRakutenUrl: document.querySelector('#new-rakuten-url'),
      newYahooUrl: document.querySelector('#new-yahoo-url'),
      newAmazonUrl: document.querySelector('#new-amazon-url'),
      newOfficialUrl: document.querySelector('#new-official-url'),
      addProduct: document.querySelector('#add-product'),
      addedList: document.querySelector('#added-list'),
      list: document.querySelector('#list'),
      summary: document.querySelector('#summary'),
      export: document.querySelector('#export'),
    };

    initSelect(controls.category, [['all', 'すべて'], ...Object.entries(labels)]);
    initSelect(controls.status, [['all', 'すべて'], ['unreviewed', '未レビュー'], ['approved', '採用'], ['needs_fix', '要修正'], ['rejected', '除外']]);
    initSelect(controls.quality, [['all', 'すべて'], ['low_confidence', '低信頼度'], ['missing_brand', 'ブランドなし'], ['missing_amount', '内容量なし'], ['missing_jan', 'JAN/GTINなし'], ['missing_image', '画像なし'], ['other', 'カテゴリその他'], ['noise', 'ノイズあり']]);
    initSelect(controls.sort, [['confidence_asc', '信頼度 低い順'], ['confidence_desc', '信頼度 高い順'], ['name_asc', '商品名順'], ['updated_desc', '更新日 新しい順']]);
    initSelect(controls.newCategory, Object.entries(labels));
    initSelect(controls.newUnit, [['', '未指定'], ['g', 'g'], ['kg', 'kg'], ['ml', 'ml'], ['L', 'L'], ['piece', '個'], ['bag', '袋']]);

    Object.values(controls).forEach((control) => {
      if (control && control.tagName !== 'SECTION' && control.id !== 'export' && control.id !== 'add-product') {
        control.addEventListener('input', render);
      }
    });
    controls.export.addEventListener('click', exportReview);
    controls.addProduct.addEventListener('click', addProduct);
    render();

    function initSelect(select, options) {
      select.innerHTML = options.map(([value, label]) => '<option value="' + value + '">' + label + '</option>').join('');
    }

    function render() {
      const rows = filteredProducts();
      renderSummary(rows);
      renderAddedProducts();
      controls.list.innerHTML = rows.length ? rows.map(renderProduct).join('') : '<div class="empty">該当する商品はありません</div>';
      document.querySelectorAll('[data-status]').forEach((select) => {
        select.addEventListener('change', (event) => updateReview(event.target.dataset.id, { status: event.target.value }));
      });
      document.querySelectorAll('[data-note]').forEach((textarea) => {
        textarea.addEventListener('input', (event) => updateReview(event.target.dataset.id, { note: event.target.value }));
      });
      document.querySelectorAll('[data-name-input]').forEach((input) => {
        input.addEventListener('input', (event) => updateProductName(event.target.dataset.id, event.target.value, event.target.dataset.originalName));
      });
      document.querySelectorAll('[data-category-input]').forEach((select) => {
        select.addEventListener('change', (event) => updateProductCategory(event.target.dataset.id, event.target.value, event.target.dataset.originalCategory));
      });
      document.querySelectorAll('[data-link-provider]').forEach((input) => {
        input.addEventListener('input', (event) => {
          updatePurchaseLink(event.target.dataset.id, event.target.dataset.linkProvider, event.target.value);
        });
      });
      document.querySelectorAll('[data-image-url-input]').forEach((input) => {
        input.addEventListener('input', (event) => updateReview(event.target.dataset.id, { imageUrl: event.target.value.trim() }));
      });
      document.querySelectorAll('[data-copy-url]').forEach((button) => {
        button.addEventListener('click', () => copyImageUrl(button.dataset.copyUrl));
      });
      document.querySelectorAll('[data-primary-image]').forEach((button) => {
        button.addEventListener('click', () => {
          updateReview(button.dataset.id, { imageUrl: button.dataset.primaryImage });
          render();
        });
      });
      document.querySelectorAll('[data-remove-addition]').forEach((button) => {
        button.addEventListener('click', () => removeAddition(button.dataset.removeAddition));
      });
    }

    function filteredProducts() {
      const query = normalize(controls.query.value);
      return products
        .filter((product) => {
          const review = state[product.id] || {};
          const category = review.category || product.category;
          if (controls.category.value !== 'all' && category !== controls.category.value) return false;
          if (controls.status.value === 'unreviewed' && review.status) return false;
          if (controls.status.value !== 'all' && controls.status.value !== 'unreviewed' && review.status !== controls.status.value) return false;
          if (!matchesQuality({ ...product, category }, controls.quality.value)) return false;
          if (!query) return true;
          const target = normalize([review.name, product.name, product.normalizedName, product.brand, category, product.janCode, product.gtin, ...(product.searchKeywords || [])].filter(Boolean).join(' '));
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
        metric(additions.length, '追加'),
      ].join('');
    }

    function metric(value, label) {
      return '<div class="metric"><strong>' + value + '</strong><span>' + label + '</span></div>';
    }

    function renderProduct(product) {
      const review = state[product.id] || {};
      const displayName = review.name || product.name;
      const displayCategory = review.category || product.category;
      const selectedImageUrl = review.imageUrl || product.imageUrl;
      const providers = Array.from(new Set((product.sources || []).map((source) => source.provider))).join(', ');
      const badges = [
        badge(labels[displayCategory] || displayCategory, displayCategory === 'other' ? 'bad' : ''),
        product.brand ? badge(product.brand, 'good') : badge('ブランドなし', 'warn'),
        product.amount !== undefined && product.unit ? badge(product.amount + product.unit, '') : badge('内容量なし', 'warn'),
        product.janCode || product.gtin ? badge('JAN/GTINあり', 'good') : badge('JAN/GTINなし', 'warn'),
        product.imageUrl || (product.packageImageUrls || []).length ? badge('画像あり', 'good') : badge('画像なし', 'warn'),
        badge('信頼度 ' + product.confidence, product.confidence >= 80 ? 'good' : product.confidence < 50 ? 'warn' : ''),
        providers ? badge(providers, '') : badge('sourceなし', 'bad'),
      ].join('');
      return '<article class="card">' +
        '<div>' +
          '<h2 class="name">' + escapeHtml(displayName) + '</h2>' +
          '<div class="badges">' + badges + '</div>' +
          '<p class="meta">' + escapeHtml(product.id) + '</p>' +
          renderImageReview(product, selectedImageUrl) +
        '</div>' +
        '<div class="review-controls">' +
          '<select data-status data-id="' + escapeHtml(product.id) + '">' +
            option('', '未レビュー', review.status) +
            option('approved', '採用', review.status) +
            option('needs_fix', '要修正', review.status) +
            option('rejected', '除外', review.status) +
          '</select>' +
          renderNameEditor(product, review) +
          renderCategoryEditor(product, review) +
          '<textarea data-note data-id="' + escapeHtml(product.id) + '" placeholder="修正メモ">' + escapeHtml(review.note || '') + '</textarea>' +
          renderPurchaseLinkEditor(product, review) +
          renderImageUrlEditor(product, review) +
        '</div>' +
      '</article>';
    }

    function renderImageReview(product, selectedImageUrl) {
      const imageUrls = uniqueUrls([selectedImageUrl, product.imageUrl, ...(product.packageImageUrls || [])]);
      if (!imageUrls.length) {
        return '<section class="image-review"><div class="image-review-title">画像候補</div><div class="image-empty">画像候補はありません</div></section>';
      }
      const visibleUrls = imageUrls.slice(0, 12);
      const extraCount = imageUrls.length - visibleUrls.length;
      return '<section class="image-review">' +
        '<div class="image-review-title">画像候補 ' + imageUrls.length + '件' +
          (product.imageUrl ? badge('代表画像あり', 'good') : badge('代表画像なし', 'warn')) +
          (extraCount > 0 ? badge('ほか' + extraCount + '件', '') : '') +
        '</div>' +
        '<div class="image-grid">' + visibleUrls.map((url) => renderImageCandidate(product.id, url, selectedImageUrl === url)).join('') + '</div>' +
      '</section>';
    }

    function renderImageCandidate(productId, url, isPrimary) {
      return '<figure class="image-candidate ' + (isPrimary ? 'selected' : '') + '">' +
        '<img src="' + escapeAttribute(url) + '" loading="lazy" referrerpolicy="no-referrer" alt="商品画像候補" />' +
        '<footer>' +
          '<div class="badges">' + (isPrimary ? badge('代表', 'good') : badge('候補', '')) + '</div>' +
          '<div class="image-url" title="' + escapeAttribute(url) + '">' + escapeHtml(shortenUrl(url)) + '</div>' +
          '<button type="button" data-primary-image="' + escapeAttribute(url) + '" data-id="' + escapeHtml(productId) + '">代表にする</button>' +
          '<button type="button" data-copy-url="' + escapeAttribute(url) + '">URLコピー</button>' +
        '</footer>' +
      '</figure>';
    }

    function renderPurchaseLinkEditor(product, review) {
      const links = { ...(product.purchaseLinks || {}), ...(review.purchaseLinks || {}) };
      return '<section class="edit-group">' +
        '<div class="edit-group-title">購入URL</div>' +
        renderAmazonQuickLinks(product) +
        linkInput(product.id, 'rakuten', '楽天', links.rakuten) +
        linkInput(product.id, 'yahoo', 'Yahoo', links.yahoo) +
        linkInput(product.id, 'amazon', 'Amazon', links.amazon) +
        linkInput(product.id, 'official', '公式', links.official) +
      '</section>';
    }

    function renderNameEditor(product, review) {
      return '<section class="edit-group">' +
        '<div class="edit-group-title">商品名</div>' +
        '<input data-name-input data-id="' + escapeHtml(product.id) + '" data-original-name="' + escapeAttribute(product.name) + '" value="' + escapeAttribute(review.name || product.name) + '" />' +
      '</section>';
    }

    function renderCategoryEditor(product, review) {
      const current = review.category || product.category;
      return '<section class="edit-group">' +
        '<div class="edit-group-title">カテゴリ</div>' +
        '<select data-category-input data-id="' + escapeHtml(product.id) + '" data-original-category="' + escapeAttribute(product.category) + '">' +
          Object.entries(labels).map(([value, label]) => option(value, label, current)).join('') +
        '</select>' +
      '</section>';
    }

    function renderAmazonQuickLinks(product) {
      const amazonLink = amazonReviewLinks[seedProductId(product.id)];
      if (!amazonLink) return '';
      const links = [
        amazonLink.searchUrl ? quickLink('Amazon検索', amazonLink.searchUrl) : '',
        amazonLink.searchUrlAllDepartments ? quickLink('全カテゴリ検索', amazonLink.searchUrlAllDepartments) : '',
        amazonLink.productUrl ? quickLink('Amazon商品', amazonLink.productUrl) : '',
      ].filter(Boolean).join('');
      const meta = [
        amazonLink.searchQuery ? badge('検索語: ' + amazonLink.searchQuery, '') : '',
        amazonLink.matchStatus ? badge(amazonLink.matchStatus, amazonLink.productUrl ? 'good' : 'warn') : '',
      ].filter(Boolean).join('');
      return links || meta ? '<div class="quick-links">' + links + meta + '</div>' : '';
    }

    function seedProductId(productMasterId) {
      return String(productMasterId || '').replace(/^pm-seed-/, '');
    }

    function quickLink(label, url) {
      return '<a class="quick-link" href="' + escapeAttribute(url) + '" target="_blank" rel="noreferrer">' + escapeHtml(label) + '</a>';
    }

    function renderImageUrlEditor(product, review) {
      return '<section class="edit-group">' +
        '<div class="edit-group-title">代表画像URL</div>' +
        '<input data-image-url-input data-id="' + escapeHtml(product.id) + '" placeholder="https://..." value="' + escapeAttribute(review.imageUrl || product.imageUrl || '') + '" />' +
      '</section>';
    }

    function linkInput(productId, provider, label, value) {
      const url = typeof value === 'string' ? value.trim() : '';
      return '<label class="link-row">' + label +
        '<input data-link-provider="' + provider + '" data-id="' + escapeHtml(productId) + '" placeholder="https://..." value="' + escapeAttribute(value || '') + '" />' +
        (isHttpUrl(url) ? '<span class="link-row-actions">' + quickLink(label + 'を開く', url) + '</span>' : '') +
      '</label>';
    }

    function uniqueUrls(values) {
      return Array.from(new Set((values || []).filter((value) => typeof value === 'string' && /^https?:\\/\\//.test(value))));
    }

    function isHttpUrl(value) {
      return /^https?:\\/\\//.test(String(value || ''));
    }

    function shortenUrl(url) {
      return url.replace(/^https?:\\/\\//, '').slice(0, 52);
    }

    function badge(text, tone) {
      return '<span class="badge ' + tone + '">' + escapeHtml(text) + '</span>';
    }

    function option(value, label, current) {
      return '<option value="' + value + '"' + (value === (current || '') ? ' selected' : '') + '>' + label + '</option>';
    }

    function updateReview(id, patch) {
      state[id] = { ...(state[id] || {}), ...patch };
      if (isEmptyReview(state[id])) delete state[id];
      localStorage.setItem(storageKey, JSON.stringify(state));
      renderSummary(filteredProducts());
    }

    function updatePurchaseLink(id, provider, value) {
      const current = state[id] || {};
      updateReview(id, {
        purchaseLinks: {
          ...(current.purchaseLinks || {}),
          [provider]: value.trim(),
        },
      });
    }

    function updateProductName(id, value, originalName) {
      const name = String(value || '').trim();
      const original = String(originalName || '').trim();
      if (!id) return;
      if (!name || name === original) {
        const current = { ...(state[id] || {}) };
        delete current.name;
        if (isEmptyReview(current)) {
          delete state[id];
        } else {
          state[id] = current;
        }
        localStorage.setItem(storageKey, JSON.stringify(state));
        renderSummary(filteredProducts());
        return;
      }
      updateReview(id, { name });
    }

    function updateProductCategory(id, value, originalCategory) {
      const category = String(value || '').trim();
      const original = String(originalCategory || '').trim();
      if (!id) return;
      if (!category || category === original) {
        const current = { ...(state[id] || {}) };
        delete current.category;
        if (isEmptyReview(current)) {
          delete state[id];
        } else {
          state[id] = current;
        }
        localStorage.setItem(storageKey, JSON.stringify(state));
        renderSummary(filteredProducts());
        return;
      }
      updateReview(id, { category });
    }

    function addProduct() {
      const now = new Date().toISOString();
      const name = controls.newName.value.trim();
      if (!name) {
        window.alert('商品名を入力してください');
        return;
      }
      const id = 'pm-manual-' + slugify(name).slice(0, 48) + '-' + Date.now();
      const amountValue = Number(controls.newAmount.value);
      const imageUrl = normalizeOptionalUrl(controls.newImageUrl.value);
      const purchaseLinks = {
        rakuten: normalizeOptionalUrl(controls.newRakutenUrl.value),
        yahoo: normalizeOptionalUrl(controls.newYahooUrl.value),
        amazon: normalizeOptionalUrl(controls.newAmazonUrl.value),
        official: normalizeOptionalUrl(controls.newOfficialUrl.value),
      };
      const product = {
        id,
        name,
        normalizedName: normalize(name),
        brand: emptyToUndefined(controls.newBrand.value),
        maker: emptyToUndefined(controls.newMaker.value),
        category: controls.newCategory.value || 'other',
        amount: Number.isFinite(amountValue) && amountValue > 0 ? amountValue : undefined,
        unit: controls.newUnit.value || undefined,
        janCode: normalizeDigits(controls.newJan.value),
        gtin: normalizeDigits(controls.newJan.value),
        imageUrl,
        packageImageUrls: imageUrl ? [imageUrl] : [],
        visualKeywords: [],
        purchaseLinks,
        searchKeywords: [],
        sources: [
          {
            provider: 'manual',
            externalId: id,
            url: purchaseLinks.official,
            imageUrl,
            rawName: name,
            fetchedAt: now,
          },
        ],
        confidence: 70,
        isVerified: true,
        createdAt: now,
        updatedAt: now,
      };
      product.searchKeywords = uniqueValues([product.name, product.normalizedName, product.brand, product.maker, product.category, product.janCode].filter(Boolean));
      additions.push(product);
      saveAdditions();
      clearAddProductForm();
      render();
    }

    function renderAddedProducts() {
      controls.addedList.innerHTML = additions.length
        ? additions.map((product) =>
            '<div class="added-item">' +
              '<div>' +
                '<strong>' + escapeHtml(product.name) + '</strong>' +
                '<div class="meta">' + escapeHtml([labels[product.category] || product.category, product.brand, product.janCode].filter(Boolean).join(' / ')) + '</div>' +
              '</div>' +
              '<button type="button" data-remove-addition="' + escapeAttribute(product.id) + '">追加から外す</button>' +
            '</div>'
          ).join('')
        : '<div class="meta">追加予定の商品はありません</div>';
    }

    function removeAddition(id) {
      const index = additions.findIndex((product) => product.id === id);
      if (index === -1) return;
      additions.splice(index, 1);
      saveAdditions();
      render();
    }

    function saveAdditions() {
      localStorage.setItem(additionsStorageKey, JSON.stringify(additions));
    }

    function clearAddProductForm() {
      [
        controls.newName,
        controls.newBrand,
        controls.newMaker,
        controls.newAmount,
        controls.newJan,
        controls.newImageUrl,
        controls.newRakutenUrl,
        controls.newYahooUrl,
        controls.newAmazonUrl,
        controls.newOfficialUrl,
      ].forEach((input) => {
        input.value = '';
      });
      controls.newCategory.value = 'dry_food';
      controls.newUnit.value = '';
    }

    function isEmptyReview(review) {
      return !review.status &&
        !review.name &&
        !review.category &&
        !review.note &&
        !Object.prototype.hasOwnProperty.call(review, 'imageUrl') &&
        !Object.keys(review.purchaseLinks || {}).length;
    }

    function exportReview() {
      const reviewedAt = new Date().toISOString();
      const payload = {
        reviewedAt,
        totalProducts: products.length,
        decisions: [
          ...Object.entries(state).map(([productId, review]) => ({ productId, ...review })),
          ...additions.map((product) => ({ productId: product.id, status: 'approved', product })),
        ],
      };
      const blob = new Blob([JSON.stringify(payload, null, 2) + '\\n'], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'productMaster.review-decisions.json';
      anchor.click();
      URL.revokeObjectURL(url);
    }

    async function copyImageUrl(url) {
      if (!url) return;
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        window.prompt('画像URLをコピーしてください', url);
      }
    }

    function normalize(value) {
      return String(value || '').normalize('NFKC').toLowerCase().replace(/[\\s\\-_/・,，.。()（）[\\]【】"'“”]/g, '');
    }

    function normalizeDigits(value) {
      const digits = String(value || '').replace(/\\D/g, '');
      return digits || undefined;
    }

    function normalizeOptionalUrl(value) {
      const trimmed = String(value || '').trim();
      return /^https?:\\/\\//.test(trimmed) ? trimmed : undefined;
    }

    function emptyToUndefined(value) {
      const trimmed = String(value || '').trim();
      return trimmed || undefined;
    }

    function slugify(value) {
      return normalize(value).replace(/[^a-z0-9]+/g, '') || 'product';
    }

    function uniqueValues(values) {
      return Array.from(new Set(values.map((value) => String(value).trim()).filter((value) => value.length >= 2)));
    }

    function escapeHtml(value) {
      return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    }

    function escapeAttribute(value) {
      return escapeHtml(value).replace(/\\x60/g, '&#96;');
    }
  </script>
</body>
</html>`;
}

function parseCsv(csv: string): Record<string, string>[] {
  const rows = parseCsvRows(csv.replace(/^\uFEFF/, '')).filter((row) =>
    row.some((value) => value.trim().length > 0),
  );
  const [header = [], ...body] = rows;
  return body.map((row) =>
    Object.fromEntries(header.map((key, index) => [key, row[index]?.trim() ?? ''])),
  );
}

function parseCsvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let inQuotes = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const next = csv[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        value += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(value);
      value = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(value);
      rows.push(row);
      row = [];
      value = '';
      continue;
    }

    value += char;
  }

  if (value.length > 0 || row.length > 0) {
    row.push(value);
    rows.push(row);
  }

  return rows;
}

void main();
