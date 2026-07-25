# 多ペット用プロダクトマスタ

このディレクトリは猫用の既存 seed を置き換えず、犬、うさぎ、小動物、鳥、観賞魚、爬虫類・両生類、昆虫向けのプロダクト単位マスタを管理する。

## ファイル

- `pet_groups_seed.csv`: アプリ上の大分類。うさぎは独立し、小動物には含めない。
- `pet_species_seed.csv`: 商品の実対象種。`pet_group + code` の組で管理する。
- `pet_species_groups_seed.csv`: 小鳥・中型インコ・大型インコ等の対象グループ。
- `product_search_queries.csv`: 対象種別の探索条件。検索対象と正規化後の判定対象は別に保持する。
- `pet_products_seed.csv`: プロダクト本体。容量・入数・JAN・容量別販売URLを含めない。
- `pet_brands_seed.csv`: 表記を正規化したブランド。
- `pet_categories_seed.csv` / `pet_subcategories_seed.csv`: 共通カテゴリ。
- `pet_product_sources.csv`: 公式カタログ等の存在確認ソース。
- `pet_product_review_queue.csv`: 個別商品ページで確認が必要な項目。
- `pet_master_quality_report.json`: 検査結果（生成物）。

`pet_products_seed.csv` の `pet_type=small_mammal` / `aquarium_fish` は、作成済みデータとの互換性を維持する旧seed表現である。新しい収集パイプラインとDBテーブルでは `pet_group=small_animal` / `aquarium` を使用し、旧seedを直接上書きしない。

API取得データは `retailer_listings_raw` に先に保存し、`product_candidates` で分類・正規化してから `products` へ統合する。検索キーワードだけを根拠に対象種を確定しない。

## 検索条件ポリシー

`product_search_queries.csv` の有効な検索条件は、優先度に応じて次の探索ページ数を確保する。

- `priority >= 95`: `max_pages >= 5`
- `priority >= 85`: `max_pages >= 4`
- その他: `max_pages >= 3`

有効な検索条件には `target_species` または `target_species_group` と、隣接種・人用品などを除外する `negative_keywords` を設定する。観賞魚の共通消耗品は淡水用・海水用を別検索にし、爬虫類・両生類のフード検索には対象食性を明記する。同一対象・同一キーワードの有効な行を重複させない。

一般語と専用語の取得範囲が大きく重なる場合は、一般語側の `max_pages` を増やし、専用語側は削除せず `enabled=false` のフォールバック行として残す。異なる用途・剤形・対象年齢・対象サイズ・原材料を示す語句は、同じ対象種でも統合しない。

`negative_keywords` はAPI検索結果を取得前に除外するものではない。取得後の正規化で該当語を検出し、`possible_wrong_search_result` としてレビュー対象にする。

`npm run quality:pet-catalog` は商品データに加え、検索条件についても次を検査する。

- 優先度に対する `max_pages` 不足、または10ページを超える過剰設定
- 検索IDと、対象・キーワードの意味的重複
- 対象種・対象グループ、除外語、カテゴリ参照の欠落
- 検索語と除外語の自己矛盾
- 観賞魚の淡水・海水表記とカテゴリごとの検索ペア
- 爬虫類・両生類フードの食性表記

## 更新手順

1. 容量だけ異なる候補は既存プロダクトに統合する。味、対象年齢、対象種、用途、形状、淡水/海水、機能の違いは別プロダクトにする。
2. `pet_products_seed.csv` を更新し、正式なプロダクト名から容量・入数を除く。公式名で判断できない場合は削除せず review queue に登録する。
3. SKU/JAN、容量、販売URLは将来のバリアントテーブルに記録する。プロダクト行に代表JANや容量別URLを入れない。
4. 新しいブランド、カテゴリ、サブカテゴリは参照先CSVに先に追加し、日本語名と英語キーを統一する。
5. `npm run quality:pet-master` を実行し、error が 0 件であることを確認する。
6. 販売終了が判明した場合は `status=discontinued` に更新し、後継品は別プロダクトとして登録する。
7. 新パイプラインでは `npm run quality:pet-catalog` と `npm run test:pet-catalog` も実行する。

## 再生成

初期候補からの再生成が必要なときだけ、`npm run build:pet-master` を実行する。このコマンドは旧 `pet_products_seed.csv` を入力にしてこのディレクトリのCSVを作るため、手修正済みの出力を上書きする前に必ず差分を確認する。
