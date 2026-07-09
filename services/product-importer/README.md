# Product Importer

猫用品の商品マスタをローカルseed、楽天商品検索API、YahooショッピングAPIから生成するためのバッチです。

APIキーは Expo アプリ本体には入れず、このディレクトリの `.env` にだけ置きます。`.env` はGit管理せず、`.env.example` だけを管理します。

```env
RAKUTEN_APPLICATION_ID=
RAKUTEN_ACCESS_KEY=
RAKUTEN_AFFILIATE_ID=
YAHOO_CLIENT_ID=
YAHOO_REQUEST_INTERVAL_MS=2200
YAHOO_RATE_LIMIT_RETRY_DELAY_MS=60000
YAHOO_MAX_RETRIES=3
YAHOO_VALUECOMMERCE_SID=
YAHOO_VALUECOMMERCE_PID=
AMAZON_ASSOCIATE_TAG=
DATABASE_URL=
```

## seed CSVから補完する

`data/seed/cat_products_seed.csv` は、アプリ初期マスタ向けの商品seedです。SKU移行後は、味・内容量別の商品行を `product_id` に持ち、元シリーズIDを `parent_product_id` に保持します。

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

SKU別seedへ移行し、旧シリーズ単位の `pm-seed-${parent_product_id}` を削除する場合:

```bash
npm run import:seed-csv -- --sku-migration
```

削除候補だけ確認する場合:

```bash
npm run import:seed-csv -- --dry-run --sku-migration --limit=0
```

`--limit` または `--offset` を指定した部分実行では、親シリーズ商品の削除は安全のためスキップされます。

楽天Provider内ではリクエスト前に `PRODUCT_IMPORT_REQUEST_DELAY_MS` の待機を入れています。未指定時は1000msです。

YahooショッピングAPI v3は、アプリケーションIDごとに1分間30リクエストを上限として扱います。Yahoo Providerでは `YAHOO_REQUEST_INTERVAL_MS` の間隔で直列実行し、未指定時は2200msです。429、403、rate limit系エラーが返った場合は `YAHOO_RATE_LIMIT_RETRY_DELAY_MS`、未指定時60000ms待って最大 `YAHOO_MAX_RETRIES`、未指定時3回リトライします。失敗したキーワード/JANはスキップしてログに残し、バッチ全体は継続します。

## 商品マスタをCSV出力する

現在のProductMasterをCSVとして書き出せます。Supabase接続情報または `DATABASE_URL` がある場合は保存先DBから読み込み、未設定の場合はローカルの `data/generated/productMaster.generated.json` から読み込みます。

```bash
npm run export:csv
```

出力先:

```text
services/product-importer/data/generated/productMaster.generated.csv
```

出力先を変える場合:

```bash
npm run export:csv -- --out=/tmp/productMaster.csv
```

Supabase/DBではなくローカルJSONを強制的に使う場合:

```bash
npm run export:csv -- --local-json
```

## 商品マスタをレビュー・修正する

現在のProductMasterを確認するHTMLを出力できます。Supabase接続情報または `DATABASE_URL` がある場合は保存先DBから読み込み、未設定の場合はローカルの `data/generated/productMaster.generated.json` から読み込みます。

```bash
npm run review:products
```

出力先:

```text
services/product-importer/data/generated/productMaster.review.html
```

Supabase/DBではなくローカルJSONを強制的に使う場合:

```bash
npm run review:products -- --local-json
```

レビュー画面では、商品の採用/要修正/除外、修正メモ、購入URL、代表画像URLを編集できます。画像候補から「代表にする」を押すと、その画像URLが代表画像としてレビュー結果に保存されます。

画面右上の「レビュー結果を書き出す」から `productMaster.review-decisions.json` を保存し、反映前にdry-runします。

```bash
npm run apply:review -- --file=/path/to/productMaster.review-decisions.json --dry-run
```

問題なければProductMasterへ反映します。Supabase接続情報が `.env` にある場合はSupabaseへ保存され、未設定の場合はローカルJSONへ保存されます。

```bash
npm run apply:review -- --file=/path/to/productMaster.review-decisions.json
```

## 本番運用方針

楽天APIはIP制限を解除できない前提で運用します。Supabase Edge Functionの送信元IPは固定IPとして扱いづらいため、本番アプリから楽天APIのリアルタイム検索は行いません。

初期の本番運用では、以下の方針にします。

- 楽天: 事前生成したProductMasterの楽天URLを使い、購入時は登録済みURLをアフィリエイトURLへ変換する。
- Yahoo: Supabase Edge Function経由で商品検索し、購入時は登録済みURLをValueCommerce URLへ変換する。
- Amazon: 登録済みURLにAmazonアソシエイトタグを付与する。
- ProductMaster: IP許可済みのローカル環境または固定IP環境でバッチ更新し、Supabase DBへ保存する。

アプリ内で楽天リアルタイム検索が必要になった場合は、固定IPを持つ中継APIを追加し、楽天API側にはその固定IPだけを許可します。

```text
Expoアプリ
  -> Supabase Edge Function
    -> 固定IPの中継API
      -> 楽天API
```

## 購入リンク検索をSupabase Edge Functionで使う

Expoアプリの「購入リンクを探す」は、APIキーをアプリ本体に入れず、Supabase Edge Function経由でYahooを検索します。楽天はIP制限のため、本番ではリアルタイム検索対象にせず、ProductMasterに事前登録された楽天URLを使います。

Edge FunctionはSupabase DBにキャッシュを保存できます。以下のSQLをSupabaseで実行してください。

```sql
-- services/product-importer/sql/edge_function_cache.sql
```

キャッシュ期間:

- 商品検索結果: 6時間
- 価格: 3時間
- アフィリエイトURL変換: 7日
- ProductMaster検索: 1日

楽天リアルタイム検索は本番では使わない方針ですが、将来固定IPの中継APIなどで再開できるように、楽天検索・楽天価格・楽天アフィリエイトURLも同じキャッシュ層を通します。

Edge Functionに以下のSecretsを設定してください。

```bash
supabase secrets set RAKUTEN_APPLICATION_ID=...
supabase secrets set RAKUTEN_ACCESS_KEY=...
supabase secrets set YAHOO_CLIENT_ID=...
supabase secrets set RAKUTEN_AFFILIATE_ID=...
supabase secrets set YAHOO_VALUECOMMERCE_SID=...
supabase secrets set YAHOO_VALUECOMMERCE_PID=...
supabase secrets set AMAZON_ASSOCIATE_TAG=...
```

`RAKUTEN_AFFILIATE_ID`、`YAHOO_VALUECOMMERCE_SID`、`YAHOO_VALUECOMMERCE_PID`、`AMAZON_ASSOCIATE_TAG` は購入URLのクリック直前変換用です。未設定でも検索や購入導線は動き、元URLへフォールバックします。

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

購入ボタンからURLを開く時も、アプリは同じEdge Functionへ問い合わせ、登録済みURLをクリック直前にアフィリエイトURLへ変換します。

- 楽天: 登録済みURLを再検索せず、Edge Function内で楽天アフィリエイトURL形式へ変換して開きます。`RAKUTEN_AFFILIATE_ID` がある場合はそれを優先し、未設定の場合は `RAKUTEN_ACCESS_KEY` を使います。
- Yahoo: `YAHOO_VALUECOMMERCE_SID` と `YAHOO_VALUECOMMERCE_PID` がある場合、登録済みYahooショッピングURLをValueCommerceのリダイレクトURLでラップします。
- Amazon: `AMAZON_ASSOCIATE_TAG` がある場合、登録済みAmazon URLに `tag` パラメータを付与します。
- その他: 初期版では元URLをそのまま開きます。正式な提携ID・規約に合わせて、Edge Function側に変換処理を追加してください。

アフィリエイト変換に失敗した場合も購入導線を止めないため、元の登録URLへフォールバックします。
