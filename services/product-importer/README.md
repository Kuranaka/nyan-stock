# Product Importer

猫用品の商品マスタをローカルseed、楽天商品検索API、YahooショッピングAPIから生成するためのバッチです。

APIキーは Expo アプリ本体には入れず、このディレクトリの `.env` にだけ置きます。`.env` はGit管理せず、`.env.example` だけを管理します。

```env
RAKUTEN_APPLICATION_ID=
RAKUTEN_ACCESS_KEY=
YAHOO_CLIENT_ID=
DATABASE_URL=
```

## シリーズseed CSVから補完する

`data/seed/cat_products_seed.csv` は、味・容量・JANまで含む完全SKUリストではなく、アプリ初期マスタ向けの商品シリーズ一覧です。

このCSVをベースに、楽天API/YahooショッピングAPIで代表候補を検索し、ProductMasterへ以下を補完します。

- JANコード
- 画像URL
- 楽天/Yahooの商品コード
- 楽天/Yahooの購入URL

価格はAPIレスポンスから取得できますが、変動するためProductMasterには固定保存しません。レビュー画面や候補評価用の一時情報として扱う前提です。

少件数で試す場合:

```bash
npm run import:seed-csv -- --limit=5
```

保存せず検索・補完ログだけ確認する場合:

```bash
npm run import:seed-csv -- --limit=5 --dry-run
```

途中から再開する場合:

```bash
npm run import:seed-csv -- --offset=50 --limit=50
```

Yahoo APIの上限に当たった場合など、片方のProviderだけで補完する場合:

```bash
npm run import:seed-csv -- --provider=rakuten
npm run import:seed-csv -- --provider=yahoo
```

長い実行で途中保存の単位を変える場合:

```bash
npm run import:seed-csv -- --batch-size=10
```

全件実行する場合:

```bash
npm run import:seed-csv
```

楽天/YahooそれぞれのProvider内でリクエスト前に `PRODUCT_IMPORT_REQUEST_DELAY_MS` の待機を入れています。未指定時は1000msです。

## 購入リンク検索をSupabase Edge Functionで使う

Expoアプリの「購入リンクを探す」は、APIキーをアプリ本体に入れず、Supabase Edge Function経由で楽天/Yahooを検索します。

Edge Functionに以下のSecretsを設定してください。

```bash
supabase secrets set RAKUTEN_APPLICATION_ID=...
supabase secrets set RAKUTEN_ACCESS_KEY=...
supabase secrets set YAHOO_CLIENT_ID=...
```

デプロイ:

```bash
supabase functions deploy purchase-link-search
```

ローカルで試す場合:

```bash
supabase functions serve purchase-link-search --env-file services/product-importer/.env
```

Expoアプリ側はAPIキーではなく、公開可能なSupabase接続情報だけを使います。

```env
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
```

通常は `EXPO_PUBLIC_SUPABASE_URL/functions/v1/purchase-link-search` を自動で呼びます。別URLを使う場合だけ、`EXPO_PUBLIC_PURCHASE_LINK_SEARCH_FUNCTION_URL` を設定してください。
