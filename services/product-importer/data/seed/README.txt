猫関連消耗品 商品マスタ CSV分割版
作成日: 2026-07-03
元ファイル: cat_consumables_brand_product_master_subcategory_unified.xlsx

CSV一覧:
- cat_products_seed.csv: 商品・シリーズ単位のメインseed。brand_id/category_id/subcategory_idで参照。
- cat_products_seed.removed-content-variants.csv: 内容量のみが異なるためメインseedから除外した行のバックアップ。メインseedと合わせると除外前の全行を復元できる。
- pet_products_seed.csv: 犬、うさぎ、小動物、鳥、観賞魚、爬虫類・両生類、フェレット、昆虫の主要商品シリーズ。`pet_type` 列で対象種別を識別し、内容量違いのSKUは1行に統合する。
- cat_brands_seed.csv: ブランドマスタ。
- cat_categories_seed.csv: 大カテゴリマスタ。
- cat_subcategories_seed.csv: サブカテゴリマスタ。
- cat_sources.csv: 参照URL一覧。
- pet-master/normalization_aliases_seed.csv: 多ペットカタログ正規化で使う動物種・ブランド・シリーズの日本語/英語/略称別名。シリーズ別名はbrand IDをcontextに持つ。

注意: JAN/容量/味ごとの完全SKUではなく、アプリ初期マスタ向けの商品シリーズ単位です。
`pet_products_seed.csv` の各行は公式・メーカーの商品一覧を参照した初期候補です。個別SKU、内容量、終売状況は取り込み前に確認します。
別名辞書を変更した場合は `npm run seed:pet-catalog` でDBへ反映し、対象rawを `npm run process:pet-catalog -- --query-id=...` で再処理します。
