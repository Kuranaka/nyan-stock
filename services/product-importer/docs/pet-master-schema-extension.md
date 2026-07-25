# 多ペット・プロダクトマスタの拡張方針

## 互換性

既存の猫用seed CSV、既存 `ProductMaster` 型、`product_masters` JSONBテーブルは変更しない。新しい多ペット収集基盤は独立テーブルへ追加し、レビュー承認済みのデータだけを将来のアダプターから既存マスタへ公開する。

旧 `pet_products_seed.csv` に残る `small_mammal` と `aquarium_fish` は既存生成物との互換用である。新基盤では要件どおり `small_animal` と `aquarium` を使う。

## データフロー

```text
pet_groups / pet_species / pet_species_groups
  + product_search_queries
    -> retailer_listings_raw
      -> product_candidates
        -> products
          -> product_retailer_listings
```

- APIレスポンスは正規化前に `retailer_listings_raw.raw_json` へ保存する。
- 検索時の大分類・対象種と、正規化後に検出した分類は別の列に置く。
- `product_candidates.classification_evidence` は商品名、商品説明、APIカテゴリの根拠を分けて保持する。
- 検索キーワードは分類根拠にもconfidence加点にも使わない。
- `confidence < 0.95` は自動商品化せず `product_review_queue` へ送る。
- 初期運用では高信頼候補も既定でレビューし、`--auto-merge-high-confidence` 指定時だけ自動統合する。

## 分類

トップレベルの `pet_group` は `cat`, `dog`, `rabbit`, `small_animal`, `bird`, `aquarium`, `reptile_amphibian`, `insect` に固定する。うさぎは `small_animal` へ入れない。

具体的な対象種は `target_species`、小鳥・中型インコ・大型インコ等は `target_species_group` に分離する。`small_animal` という値を対象種として保存しない。「小動物用」としか確認できない候補は `target_scope=unconfirmed` とし、review queueへ送る。

`target_scope` は以下を使う。

- `species_specific`: 1種専用
- `multi_species`: 明示された複数種対応
- `group_wide`: 公式確認済みの大分類全体対応
- `unconfirmed`: 対象範囲を確認できない候補。`products` には登録しない

## 正規化とcanonical key

容量、重量、入数、セット数、価格、店舗、送料、ポイント、販売URLは販売商品側へ残し、プロダクト分割には使わない。

canonical keyは次を順に正規化して連結する。

```text
brand
series
base_product_name
pet_group
sorted(target_species)
target_species_group
target_age
target_size
life_stage
feeding_type
habitat_type
flavor
primary_ingredient
purpose
function
```

`primary_ingredient` と `purpose` は、安全な分割条件を満たすための追加ディスクリミネータである。

味、主原料、対象種、対象年齢、対象サイズ、用途、機能、淡水/海水、食性、幼虫/成虫の差は別プロダクトにする。複数種対応商品は対象種ごとに複製せず、ソート済み配列を1プロダクトに保持する。

## DBと権限

スキーマは `supabase/migrations/20260719000000_pet_product_catalog_pipeline.sql` に追加する。raw API payloadと内部レビュー内容を含むため、全テーブルでRLSを有効にし、`anon` / `authenticated` 用ポリシーは作らない。バッチは `service_role` または管理用 `DATABASE_URL` から実行する。
