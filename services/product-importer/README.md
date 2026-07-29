# Product Importer

猫用品の既存マスタと、多ペット用品の候補をローカルseed、楽天市場商品検索API、楽天商品価格ナビ製品検索API、Yahoo!ショッピング商品検索APIから生成するためのバッチです。

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

## 多ペット用プロダクトカタログ

正規化、canonical key、confidence、issue dispositionの詳細は [`docs/pet-catalog-normalization.md`](docs/pet-catalog-normalization.md) を参照してください。

既存の猫用 `product_masters` は後方互換のため変更しません。多ペット用は次の独立パイプラインで処理します。

```text
product_search_queries
  -> retailer_listings_raw
  -> product_candidates
  -> products
  -> product_variants
  -> product_identity_keys
  -> product_retailer_listings
```

Supabaseへ `supabase/migrations/20260719000000_pet_product_catalog_pipeline.sql` を適用した後、分類・カテゴリ・検索条件を投入します。
将来の多言語・海外市場対応に備える追補として、続けて `supabase/migrations/20260720000000_prepare_pet_catalog_localization.sql` を適用します。現在の検索マスタに列がない場合は `locale=ja-JP`、`market_code=JP`、`currency_code=JPY` が自動適用されるため、現在の日本向け処理は変わりません。
issueの重要度分類には `supabase/migrations/20260720000001_product_review_issue_disposition.sql` も適用します。
別名辞書と商品variant/JAN・型番識別には `supabase/migrations/20260720000002_product_variants_and_normalization_aliases.sql` も適用します。このmigration適用前に新しい`seed:pet-catalog`、`merge:pet-catalog`、`quality:pet-catalog`を実行すると、追加テーブルが存在せず失敗します。
既存の`product_retailer_listings`がある環境では、続けて `supabase/migrations/20260720000003_backfill_legacy_product_variants.sql` を適用します。旧listingには誤統合しない暫定variantを1件ずつ割り当て、再process・mergeされた時点でJAN・型番・属性ベースの正式variantへリンクを更新します。
blockingレビュー機構には `supabase/migrations/20260722000000_pet_catalog_blocking_review.sql` も適用します。人手判断とcandidate状態を同一トランザクションで更新するDB関数を追加します。
リリース用の新マスタ生成には `supabase/migrations/20260722000001_create_pet_product_masters.sql` も適用します。既存の `product_masters` は変更せず、分類付きの `pet_product_masters` を別テーブルとして追加します。
blocking候補の自動除外範囲を広げる `supabase/migrations/20260723000000_tighten_pet_catalog_reject_policy.sql` も適用します。複数pet group、pet group未確定、統合confidence 0.80未満をrejectへ変更し、同一candidateの残りissueもレビュー対象から閉じます。
life stage不明を自動承認する `supabase/migrations/20260723000001_auto_resolve_life_stage_unknown.sql` も適用します。既存のopen issueを`non_blocking/resolved`へ変更し、他にblockingがなく統合条件を満たすcandidateを`merge_ready`へ戻します。
過去の名前・ブランド完全一致承認を安全化する `supabase/migrations/20260726000002_tighten_pet_catalog_exact_match_resolution.sql` も適用します。`variant_merge_uncertain`の自動解決は、対象種・生息環境・ライフステージ等を含む`canonical_key`が別candidateまたは既存productと完全一致する場合だけに限定します。
大規模テーブルでの全件走査を避ける `supabase/migrations/20260726000003_target_pet_catalog_exact_match_resolution.sql` も適用します。自動解決RPCは当該`process`で更新したcandidate IDだけを最大1,000件ずつ再評価します。

商品ID・分類ID・`canonical_key`は言語非依存の識別子として維持し、将来の表示文言は `product_translations` および各分類の `*_translations` に格納します。APIから取得した原文には `content_locale` と `market_code` を保存します。翻訳テーブルは準備のみで、現在のアプリ表示にはまだ使用しません。

```bash
npm run seed:pet-catalog
```

`seed:pet-catalog`は分類・検索条件に加えて、`data/seed/pet-master/normalization_aliases_seed.csv`の動物種・ブランド・シリーズ別名も`normalization_aliases`へ投入します。正規化処理ではGit管理するCSVをルールのソースとして読み、DBテーブルは適用済み辞書の監査・参照用ミラーとして保持します。辞書を変更した場合はseed後に対象rawを再processしてください。

パイプラインは、外部API取得、保存済みrawの正規化、高信頼候補の統合を別コマンドで実行します。

### 1. APIから取得してraw保存

```bash
npm run collect:pet-catalog -- --limit-queries=3
npm run collect:pet-catalog -- --query-id=psq-hamster-food
npm run collect:pet-catalog -- --pet-group=rabbit --providers=rakuten_ichiba,yahoo_shopping
```

`collect:pet-catalog`は `retailer_listings_raw` の保存と `last_searched_at` の更新だけを行います。候補生成、レビュー登録、products統合は行いません。`--dry-run`ではAPIレスポンスをDBへ保存せずJSONへ出力します。

### 2. 保存済みrawを正規化

```bash
npm run process:pet-catalog -- --query-id=psq-hamster-food
npm run process:pet-catalog -- --pet-group=rabbit --limit-queries=10
npm run process:pet-catalog -- --offset=50 --concurrency=8
```

`process:pet-catalog`は外部APIを呼びません。`retailer_listings_raw`を読み、`product_candidates`と必要な`product_review_queue`を更新します。`reject`または`blocking` issueがなく、pet_group・対象範囲・商品同一性の最低基準を満たす候補は`merge_ready`になりますが、この工程ではproductsへ統合しません。

候補とレビューissueの保存は、既定でquery内の8件を上限に並列実行します。`--concurrency=1`から`--concurrency=32`で調整できます。SupabaseからHTTP 429が続く場合は値を下げ、回線とDBに余裕がある場合だけ段階的に上げてください。query単位のraw読み込みは順番に実行するため、大きなテーブル走査を並列には行いません。

全queryの正規化後、`canonical_key`が別candidateまたは既存productと完全一致する候補をDB関数で再評価します。一致候補の`variant_merge_uncertain`は自動承認されます。pet group不明、対象範囲未確定、他のblocking/reject issueがある候補は完全一致だけでは承認しません。

各issueには次の`disposition`を付与します。

- `blocking`: pet_group、対象範囲、商品同一性など、人手確認が必要。`status=open`で保存する。
- `non_blocking`: nullのまま採用可能。監査記録として残し、レビュー行は自動的に`resolved`にする。
- `reject`: 検索外商品・対象pet_group違い。候補を`rejected`にし、レビュー行も`rejected`にする。

主なルール:

- 犬用シャンプー等の非摂取汎用品で対象種・年齢が不明: `non_blocking`
- 小動物用品で具体的な対象種が不明: `blocking`
- life stage不明: `non_blocking`（任意属性としてnullを許容）
- 鳥類で鳥種・体格が不明: `non_blocking`（鳥類カテゴリとして採用）
- 観賞魚で淡水・海水が不明: `non_blocking`（観賞魚カテゴリとして採用）
- 爬虫類・両生類で対象種・食性が不明: `non_blocking`（爬虫類・両生類カテゴリとして採用）
- 容量・入数の疑わしい表記: `non_blocking`として販売listing側をnullにする
- 除外語または検索pet_groupとの不一致: `reject`
- 複数pet group、pet group未確定: `reject`（現行マスタでは安全に一意分類できない）
- `merge_confidence < 0.80`: `reject`、`0.80以上0.85未満`: `blocking`、`0.85以上`: 他のblocking条件がなければ統合可能

DBを変更せず正規化結果を確認する場合:

```bash
npm run process:pet-catalog -- --query-id=psq-hamster-food --dry-run
```

### 3. merge_ready候補を正式統合

まず対象件数だけ確認します。

```bash
npm run merge:pet-catalog -- --query-id=psq-hamster-food --dry-run
```

問題なければ正式統合します。

```bash
npm run merge:pet-catalog -- --query-id=psq-hamster-food
npm run merge:pet-catalog -- --offset=50 --concurrency=4
```

`merge:pet-catalog`は保存済みの`merge_ready`候補だけを`products`、`product_variants`、`product_identity_keys`、`product_retailer_listings`へ統合します。API取得や再正規化は行いません。

Supabase REST経由では既定4並列で統合します。同じcanonical key、JAN、またはJANがない場合のブランドスコープ型番を共有する候補は競合防止のため自動的に直列化されます。`--concurrency=1`から`--concurrency=16`で調整できます。`DATABASE_URL`で単一PostgreSQL接続を使う場合はトランザクション混在を避けるため常に1並列です。

### 4. リリース用の新しいproduct masterを生成

`merge:pet-catalog`の統合結果から、1つの`product_variant`につき1件の`pet_product_masters`を生成します。まずDBを書き換えず、プレビューJSONと件数を確認します。

```bash
npm run quality:pet-catalog
npm run build:pet-product-masters -- --dry-run
```

既定のプレビューは`data/generated/petProductMaster.preview.json`です。問題がなければ新しいテーブルへupsertします。

```bash
npm run build:pet-product-masters
npm run build:pet-product-masters -- --concurrency=4
```

buildは対象productsからvariant、identity、retailer link、必要なraw listing列だけを段階取得します。`retailer_listings_raw.raw_json`、candidate、review queueは取得しません。保存は100件単位のバッチを既定4並列でupsertし、`--concurrency=1`から`--concurrency=16`で調整できます。

新マスタには、商品名・ブランド・容量・JAN・販売先に加えて、`petGroup`、`targetSpecies`、`targetScope`、`categoryId`、`subcategoryId`を含めます。分類や販売情報は検索APIのrawから直接作らず、レビューとmergeを通過した`products`、`product_variants`、`product_identity_keys`、`product_retailer_listings`から組み立てます。

既存の`product_masters`とはテーブル・共有型ともに独立しています。アプリの商品検索は`pet_product_masters`の`published`を参照します。新マスタの状態は次のように決まります。

- variantが`active`で、元の`products.status`が`active`、`approved`、または通常build時の`draft`: `published`
- 元の`products.status`が`rejected`、またはvariantが`inactive`/`rejected`: `retired`
- `--draft`指定時の元`draft` product: `draft`

anon/authenticatedから参照できるのは`published`だけです。通常buildでは、rejectされていないdraft productとactive variantを`published`として保存します。公開せず確認用に作る場合だけ`--draft`を指定します。旧listing移行時の暫定`legacy:` variantは誤公開を避けるため既定では除外します。必要な場合のみ`--include-legacy-variants`を指定してください。

```bash
npm run build:pet-product-masters -- --pet-group=cat --dry-run
npm run build:pet-product-masters -- --limit=100 --dry-run
npm run build:pet-product-masters -- --out=data/generated/cat-product-master.json --pet-group=cat --dry-run
npm run build:pet-product-masters -- --draft --dry-run
```

### 本番へ公開マスタを移行

`.env.development`の公開済み`pet_product_masters`を`.env.production`のSupabaseへ移す場合は、まず書き込みなしで件数と参照整合性を確認し、その後`--apply`を指定します。外部キーに必要な`products`、`product_variants`、identity、商品翻訳も依存順にupsertします。既存の本番行は削除しません。

```bash
npm run promote:pet-product-masters
npm run promote:pet-product-masters -- --apply --concurrency=4
```

対象は開発環境で`published`のマスタだけです。スクリプトはsourceとtargetが別projectであり、targetが`production`であることを検証し、投入後に全マスタIDを読み戻します。

Supabaseからmerge対象を読む際は、raw listingをquery単位でページングし、そのIDを100件ずつ指定してcandidateを取得します。巨大なraw JSONをPostgRESTの埋め込みJOINで取得しないため、件数増加時のHTTP 500とメモリ負荷を抑えます。

同一性はJANを最優先し、有効なJANがない場合だけブランドまたはメーカーでスコープした型番を使用します。JAN・型番がない場合は、商品に容量・単位・入数・包装区分を加えたvariant keyへフォールバックします。JANがある候補では型番を同時にidentity keyへ登録しません。販売元によっては容量違いの商品へ同じシリーズ型番を付けるためで、容量違いはJANごとに同じproduct配下の別variantとして保持します。

優先度降順・同一優先度ではID順に並べた検索条件を、0始まりのoffsetから再開できます。`--offset`は`--offset-queries`の短縮形です。`--pet-group`や`--query-id`を併用した場合は、絞り込み後の一覧へoffsetを適用します。

```bash
npm run collect:pet-catalog -- --offset-queries=50
npm run collect:pet-catalog -- --offset=50 --limit-queries=25
npm run collect:pet-catalog -- --pet-group=rabbit --offset-queries=10
```

実行ログには各検索条件の `offset=N` が表示されます。失敗した行を含めて再開する場合は、その数値をそのまま `--offset-queries=N` に指定します。検索条件の追加やpriority変更後は並び順が変わる可能性があるため、古いログのoffsetではなく `--query-id` を使用してください。

`--query-id`、`--pet-group`、`--offset`、`--limit-queries`は3工程で共通です。`--providers`はAPI取得を行う`collect:pet-catalog`だけで使用できます。

DB全体またはdry-run JSONの品質を検査します。

```bash
npm run quality:pet-catalog
npm run quality:pet-catalog -- --input=data/generated/petCatalog.preview.json
npm run test:pet-catalog
```

### blocking候補をCSVでレビュー

openのblocking issueをcandidate単位でCSVへ出力します。全件、pet group限定、先頭件数限定を選べます。export時は品質チェック用の全テーブルを走査せず、openのblocking issueと、それらに紐づくcandidate・raw listingだけを取得します。apply時もCSVで判断済みのcandidateだけを再取得して、issueが古くなっていないか検証します。

```bash
npm run review:pet-catalog -- export
npm run review:pet-catalog -- export --pet-group=small_animal
npm run review:pet-catalog -- export --limit=100 --out=data/generated/review-small-animal.csv
```

既定の出力先は`data/generated/petCatalog.blocking-review.csv`です。1candidateに複数issueがある場合は物理的な1行へまとめます。issue詳細や商品名などに含まれる改行は ` / ` へ変換するため、表計算ソフトや行単位処理でもレコードが崩れません。商品名、分類、confidence、issue詳細、推奨対応、販売URL、画像URL、JAN、型番を確認し、次の列だけを編集します。

- `decision`: `approve` / `reject` / `keep_open`。空欄も`keep_open`と同じ。
- `reviewer`: 判断者名。apply時の`--reviewer`で一括指定も可能。
- `review_note`: 判断根拠。空欄時は標準文言を保存。
- `expected_issue_types`: staleチェック用。編集しない。

まずdry-runでCSV形式と判断件数を確認します。

```bash
npm run review:pet-catalog -- apply --file=data/generated/petCatalog.blocking-review.csv --reviewer=apple --dry-run
```

問題なければ正式反映します。

```bash
npm run review:pet-catalog -- apply --file=data/generated/petCatalog.blocking-review.csv --reviewer=apple
npm run merge:pet-catalog -- --dry-run
npm run quality:pet-catalog
```

`approve`はopen blocking issueを`approved`にしcandidateを`merge_ready`へ変更します。対象種が空で`target_scope=unconfirmed`なら、明示的な人手承認として`group_wide`にします。`reject`はissueとcandidateを`rejected`にします。export後にissueが変化したCSVは`expected_issue_types`不一致で適用を停止するため、再exportして判断し直してください。再processすると現行ルールからissueを再生成するため、レビュー後は原則mergeへ進み、再processが必要な場合はレビューCSVも再exportします。

検索に指定した `pet_group` / `target_species` はrawの検索メタデータとして残しますが、正規化後の分類根拠やconfidence加点には使用しません。対象種を商品名・説明・APIカテゴリから確認できない商品は推測せずreview queueへ送ります。

実装が参照する公式API仕様:

- [楽天市場商品検索API 2026-07-01](https://webservice.rakuten.co.jp/documentation/ichiba-item-search)
- [楽天商品価格ナビ製品検索API 2025-08-01](https://webservice.rakuten.co.jp/documentation/ichiba-product-search)
- [Yahoo!ショッピング商品検索 v3](https://developer.yahoo.co.jp/webapi/shopping/v3/itemsearch.html)

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

Supabase RESTへの読み書きは、`ECONNRESET`等の一時的な通信切断とHTTP 408・429・5xxを指数バックオフで再試行します。未指定時は `SUPABASE_REQUEST_RETRY_BASE_MS=750` から待機を始め、最大 `SUPABASE_REQUEST_MAX_RETRIES=4` 回再試行します。400系のデータ・制約エラーは再試行しません。

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

`RAKUTEN_AFFILIATE_ID` は楽天APIに渡し、APIが返す公式 `affiliateUrl` を取得するために使用します。`YAHOO_VALUECOMMERCE_SID`、`YAHOO_VALUECOMMERCE_PID`、`AMAZON_ASSOCIATE_TAG` は購入URLのクリック直前変換用です。未設定でも検索や購入導線は動き、元URLへフォールバックします。

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

購入ボタンからURLを開く時、AmazonとYahooは同じEdge Functionへ問い合わせます。楽天はクリック直前の手動変換を行わず、商品マスターまたは楽天APIから取得済みの公式アフィリエイトURLをアプリからそのまま開きます。

- 楽天: `RAKUTEN_AFFILIATE_ID` をAPIリクエストに渡し、APIが返した `affiliateUrl` を優先して保存・利用します。ユーザーが登録した通常URLや商品名から作った検索URLは変換せず、そのまま開きます。`RAKUTEN_ACCESS_KEY` をアフィリエイトIDの代わりには使用しません。
- Yahoo: `YAHOO_VALUECOMMERCE_SID` と `YAHOO_VALUECOMMERCE_PID` がある場合、登録済みYahooショッピングURLをValueCommerceのリダイレクトURLでラップします。
- Amazon: `AMAZON_ASSOCIATE_TAG` がある場合、登録済みAmazon URLに `tag` パラメータを付与します。
- その他: 初期版では元URLをそのまま開きます。正式な提携ID・規約に合わせて、Edge Function側に変換処理を追加してください。

アフィリエイト変換に失敗した場合も購入導線を止めないため、元の登録URLへフォールバックします。
