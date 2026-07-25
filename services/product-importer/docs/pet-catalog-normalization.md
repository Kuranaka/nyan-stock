# ペットカタログ正規化・issue判定仕様

## 目的

楽天市場商品検索API、楽天商品価格ナビ製品検索API、Yahoo!ショッピング商品検索APIから取得した販売情報を、ペット用品のプロダクト候補へ正規化する。

正規化はAI推論ではなく、商品名・説明・APIカテゴリと管理可能な別名辞書を対象にした決定的なルールベース処理である。確認できない属性を検索条件から推測せず、`null`またはissueとして扱う。

主な実装:

- `src/petCatalog/normalizeListing.ts`: 属性抽出、商品名整形、canonical key、confidence、issue検出
- `src/petCatalog/normalizationAliases.ts`: 動物種・ブランド・シリーズ別名の読込と照合
- `src/petCatalog/issuePolicy.ts`: issueの`blocking` / `non_blocking` / `reject`判定
- `src/petCatalog/repository.ts`: raw、candidate、review、productの永続化
- `src/scripts/collectPetProductCatalog.ts`: 外部API取得とraw保存
- `src/scripts/processPetProductCatalog.ts`: 保存済みrawの正規化
- `src/scripts/mergePetProductCatalog.ts`: `merge_ready`候補の正式統合

## パイプライン

```text
product_search_queries
  -> collect:pet-catalog
  -> retailer_listings_raw
  -> process:pet-catalog
  -> product_candidates
  -> product_review_queue
  -> merge:pet-catalog
  -> products
  -> product_variants
  -> product_identity_keys
  -> product_retailer_listings
```

各工程は分離されている。

- `collect`: APIを呼び、原文をraw保存する。正規化・統合は行わない。
- `process`: APIを呼ばず、保存済みrawを正規化する。products統合は行わない。
- `merge`: 再取得・再正規化を行わず、保存済み`merge_ready`候補だけを統合する。

## 入力と原文保持

`retailer_listings_raw`には以下を原文のまま保存する。

- 商品名、商品説明
- ブランド、メーカー、販売店
- JAN、型番
- 価格、通貨、販売URL、画像URL
- APIカテゴリ
- APIレスポンス全体
- 検索クエリID、検索時のpet_group・target_species
- content locale、market code

正規化結果を更新してもrawは上書き加工しない。ルール変更時は`process:pet-catalog`で再処理する。再処理時はcandidateのreview issueを現行判定で置換するため、解消済みの旧blocking/reject issueは残らない。

## 正規化処理

### 1. 文字表記の統一

商品名・説明をUnicode NFKCで正規化する。全角英数字、互換文字、記号差などを揃える。

```text
ＭＬ－４６８ -> ML-468
１ｋｇ       -> 1kg
```

### 2. 対象動物・pet_group抽出

商品名、説明、APIカテゴリを別名辞書と正規表現辞書に照合する。`normalization_aliases_seed.csv`には日本語・英語・略称・メーカー固有表現を登録でき、別名辞書を優先し、既存の正規表現はフォールバックとして使用する。

例:

```text
犬、ドッグ       -> dog
うさぎ、ラビット -> rabbit
ハムスター       -> hamster / small_animal
セキセイインコ   -> budgerigar / bird
金魚             -> goldfish / aquarium
リクガメ         -> tortoise / reptile_amphibian
カブトムシ       -> rhinoceros_beetle / insect
```

抽出根拠は`classification_evidence`に、値・検出元・一致文字列を保存する。

```text
source: title | description | api_category
```

検索キーワードや検索マスタの`target_species`は分類根拠やconfidence加点に使用しない。検索文脈として`classification_evidence.searchContext`へ記録するだけである。

別名辞書の各行は`alias_type`、`locale`、`alias`、`canonical_value`、`context_value`、`display_value`、`priority`を持つ。

- `species`: `canonical_value`は言語非依存のspecies ID、`context_value`はpet group
- `brand`: `canonical_value`はbrand ID、`display_value`は標準表示名
- `series`: `canonical_value`は標準シリーズ値、`context_value`はbrand ID

英語の短い別名は単語境界を考慮し、別単語の一部への誤一致を避ける。シリーズ別名はブランド文脈が一致した場合だけ採用し、同名シリーズのメーカー間衝突を防ぐ。辞書のソースは`data/seed/pet-master/normalization_aliases_seed.csv`で、`seed:pet-catalog`によりDBの`normalization_aliases`へも保存する。辞書更新後は対象データを`process:pet-catalog`で再処理する。

pet_group候補が1つの場合だけpet_groupを確定する。複数pet_groupを検出した場合は未確定とし、現行マスタでは一意に安全に表現できないためreject issueを作る。

### 3. target scope

```text
対象種が1つ   -> species_specific
対象種が複数 -> multi_species
対象種なし   -> 一旦unconfirmed
```

issue policyで対象種不明が`non_blocking`となる非摂取汎用品、および鳥類・観賞魚・爬虫類／両生類の内部分類不明商品は、pet_group単位の`group_wide`へ変更できる。

「不明」と「全年齢・全種対応」は同一視しない。明示的に確認できない属性は原則`null`にする。

### 4. 属性抽出

商品名・説明から以下を抽出する。

- `target_age`: juvenile、adult、senior、all_ages
- `target_size`: small、medium、large
- `life_stage`: egg、larva、pupa、juvenile、adult、all_stages
- `habitat_type`: freshwater、marine、brackish、both
- `feeding_type`: herbivore、carnivore、omnivore、insectivore、species_specific
- `flavor`: チキン、ビーフ、サーモン等
- `primary_ingredient`: timothy、alfalfa、mealworm等
- `product_function`: 毛球ケア、デンタルケア、水質調整等
- `purpose`: food、bedding、toilet、care、filter_media
- `package_type`: main、refill

辞書に一致しない値は推測せず`null`にする。

### 5. 容量・入数抽出

商品名から重量、容量、入数を抽出する。

```text
1kg
500ml
100g x 3袋
30枚入り
```

容量・入数・JAN・型番は販売listingまたはcandidate側で保持し、シリーズ・基本商品としてのproductsの同一性には含めない。容量違い・入数違いだけで別productを作らず、同じproduct配下の別`product_variants`として保持する。

JANや型番を容量として誤認しないよう、桁境界、最大値、長すぎる数値トークンを検査する。不審な表記は`package_data_suspicious`とするが、原則`non_blocking`である。`2個入り`、`二個入り`、`4コ入`、`20袋入`、`20セット入り`、`１セットで`、`20g×20袋入`などの入数表記はlisting側のquantityへ保存し、基本商品名からは「り」「入」「コ入」「セット入り」などの断片を残さず表記全体を除去する。

`冷蔵★`、`別途クール手数料`、`常温商品同梱不可`、`代引不可`、`北海道・沖縄・離島配送不可`、`全国送料350円対応`、`返品種別A`、`Yahoo!限定価格`、`お一人様10点限り`、`商品説明をよくお読みの上、ご注文下さい`などの購入・配送条件や注意文は基本商品名から除去する。`お買い得`、`徳用`、`1個分お得`、`価格は1個のお値段です`などの商品同一性に関係しない価格訴求表現も除去する。単価説明内の`1個`はlistingのquantityとして抽出しない。`cc`は容量単位として抽出し、数値を変えずcanonicalな`ml`単位へ正規化する。

ノイズ文言を除去した後に空となった`「 」`、`〔 〕`、`『 』`等の囲みは削除する。内容が残る囲みについても記号だけを外し、内部の商品識別文字列は保持する。

### 6. 基本商品名

商品名から以下を除去して`base_product_name`を作る。

- 送料無料、ポイント、セール、即納、正規品等の販促語
- まとめ買い、セット販売
- 容量・入数
- JAN
- 抽出済みブランド名
- 空括弧、余分な記号・空白

`normalized_name`は基本商品名を表示用に再整形した値である。

### 7. canonical key

以下を正規化して連結し、商品同一性判定用の`canonical_key`を作る。

- ブランド、シリーズ、基本商品名
- pet_group、target_species、target_species_group
- 年齢、サイズ、life stage
- feeding type、habitat type
- 味、主原料、用途、機能

以下はcanonical keyに含めない。

- 容量、入数
- JAN、型番
- 価格、販売店、販売URL

canonical keyはJAN・型番を取得できない場合のproduct同一性フォールバックとして使用する。商品名だけで直接販売listingを統合せず、下記のvariant同一性判定と組み合わせる。

### 8. product、variant、identity key

正式統合時の同一性判定は、強い識別子から順に行う。

```text
JAN（global namespace）
  > 型番（brand/maker namespace）
  > product + 容量・単位・入数・包装区分
  > product + provider + provider item ID
```

- `products`: ブランド、シリーズ、用途等を共有する基本商品
- `product_variants`: 容量、入数、包装区分が異なる販売可能単位
- `product_identity_keys`: variantへ紐づくJANまたは型番
- `product_retailer_listings`: 販売店listingをproductとvariantの両方へ紐づける

JANは数字だけへ正規化し、8〜14桁のみ採用する。型番はNFKC、英小文字化、空白・ハイフン差の正規化を行い、ブランドまたはメーカー名前空間が得られる場合だけ採用する。型番単独をグローバル識別子にしない。JANと型番が既存の異なるvariantを指す場合は、誤統合を避けるため処理を停止する。

同じ強いidentityを持つ販売候補間で対象種・環境・食性等の抽出結果が異なる場合、SKU統合は維持しつつ`strong_identity_classification_disagreement` warningを出す。販売店説明の関連商品語などで分類がぶれる場合があるため、product側の分類はメーカー公式情報で確認する。JAN・型番のない候補間の分類差異は引き続きquality errorとする。

variant導入前の`product_retailer_listings`には、migrationでlisting単位の`legacy:` variantを割り当てる。これは既存データを推測で統合しないための暫定値であり、そのcandidateを再process・mergeすると通常のidentity/属性variantへリンクが置き換わる。

## confidence

### classification confidence

分類根拠の強さを評価する。

- pet_groupが一意
- 商品名に対象種がある
- 説明にも対象種がある
- 商品名・説明・APIカテゴリにpet_group根拠がある
- ブランド、機能、環境、成長段階、食性が取得できる

対象種がない場合は最大`0.74`、pet_group候補が1つでない場合は最大`0.60`に制限する。

### merge confidence

商品同一性の確度を評価する。

- ブランドがある
- 基本商品名が十分長い
- pet_groupがある
- target_speciesがある
- 年齢、サイズ、味、用途等の識別属性がある

### 総合confidence

```text
confidence = min(classification_confidence, merge_confidence)
```

最終的な`merge_ready`判定では、総合confidenceだけでなくissue disposition、pet_group、target scope、`merge_confidence >= 0.85`を使用する。

例外として、正規化商品名・正規化済みブランド・pet groupが別candidateまたは既存productと完全一致する場合は、`variant_merge_uncertain`を`non_blocking/resolved`へ変更する。この完全一致は表記揺れを許す類似検索ではなく、DB上の文字列完全一致である。pet groupとtarget scopeは引き続き確定必須で、他のblocking/reject issueは自動解除しない。

## issue検出

主なissue:

- `target_species_unknown`
- `small_animal_scope_unclear`
- `multiple_pet_groups_detected`
- `rabbit_or_small_animal_unclear`
- `bird_species_unknown`
- `freshwater_or_marine_unknown`
- `life_stage_unknown`
- `feeding_type_unknown`
- `possible_wrong_search_result`
- `possible_duplicate`
- `variant_merge_uncertain`
- `package_data_suspicious`

## issue disposition

### blocking

人手確認なしでproductsへ統合しない。

- 小動物用品の具体的対象種が不明
- 犬・猫等の摂取物、薬剤、療法関連で必要な対象種が不明
- 重複・統合先や商品同一性の確度不足。ただし人手レビュー対象は`merge_confidence >= 0.80`に限る

レビュー行は`disposition=blocking`、`status=open`になる。candidateは`review_required`になる。

### non_blocking

不明値を`null`のまま許容し、監査記録だけ残す。

- 非摂取汎用品の対象種不明
- 鳥類カテゴリ内の鳥種・体格不明
- 観賞魚カテゴリ内の対象魚種・淡水海水不明
- 爬虫類・両生類カテゴリ内の対象種・食性不明
- life stage不明。商品分類・統合を妨げない任意属性としてnullを許容
- 容量・入数の不審な表記

レビュー行は`disposition=non_blocking`、`status=resolved`として自動解決する。pet_group、target scope、merge confidenceの条件を満たせばcandidateは`merge_ready`になる。

### reject

検索対象外としてproductsへ統合しない。

- negative keywordを検出
- 検索pet_groupと判定pet_groupが不一致
- 複数pet_groupを検出、またはうさぎ・小動物のpet groupを一意に決められない
- pet_groupと対象種をどちらも確定できない
- `variant_merge_uncertain`かつ`merge_confidence < 0.80`

candidateを`rejected`にし、同一candidateの全レビュー行を`rejected`として閉じる。reject以外のissueもopenのまま残さないため、blockingレビューCSVへ再出現しない。

`merge_confidence`の境界は、0.80未満を「人手で個別救済するより検索・辞書・正規化ルールの改善後に再生成すべき候補」、0.80以上0.85未満を「人手確認可能な候補」、0.85以上を「他のblocking条件がなければ統合可能な候補」とする。

正規化商品名・ブランド・pet groupの完全一致候補は上記confidence境界の例外とし、variant merge issueを自動承認する。merge実行時はJAN・型番一致を最優先し、それらがない場合に同じ完全一致条件の既存productを統合先として使用する。完全一致productが複数存在する場合は自動選択せずエラーにする。

## candidate status

優先順位は以下である。

```text
reject issueあり
  -> rejected

blocking issueあり
  -> review_required

pet_group不明、target scope不明、merge confidence不足
  -> review_required

non-blocking issueのみ、またはissueなしで構造条件を満たす
  -> merge_ready
```

`merge:pet-catalog`は`merge_ready`だけを取得し、productsへ統合する。

## blocking issueの人手レビュー

`review:pet-catalog -- export`は、openかつblockingのissueをcandidate単位にまとめたCSVを生成する。レビュー判断は`approve`、`reject`、`keep_open`のいずれかとする。

- `approve`: issueを`approved`にし、candidateを`merge_ready`へ変更する。不明対象種を人手で許容した場合は`group_wide`を設定できる。
- `reject`: issueとcandidateを`rejected`にする。
- `keep_open`または空欄: DBを変更しない。

applyはexport時のblocking issue type一覧をfingerprintとして照合する。再process等でissueが増減したcandidateには古いCSVを適用せず停止する。DB関数内でissueとcandidateを同一トランザクションにより更新し、`checked_at`、`checked_by`、`resolution_note`を監査記録として残す。

## 実行例

保存済みrawの正規化:

```bash
npm run process:pet-catalog -- --query-id=psq-dog-adult-food
```

DBへ書き込まない確認:

```bash
npm run process:pet-catalog -- --query-id=psq-dog-adult-food --dry-run
```

統合件数の確認:

```bash
npm run merge:pet-catalog -- --query-id=psq-dog-adult-food --dry-run
```

正式統合:

```bash
npm run merge:pet-catalog -- --query-id=psq-dog-adult-food
```

品質チェック:

```bash
npm run quality:pet-catalog
```

## 既知の制約

- 別名辞書未登録の新語、綴り違い、未知の動物種・ブランド・シリーズは取りこぼす可能性がある。検出漏れは辞書と代表テストへ追加する。
- JAN・型番が提供されない商品は属性付きvariant keyとcanonical keyへフォールバックするため、メーカー公式IDを持つ場合より統合精度が下がる。
- 同じJANの誤登録やメーカー内で再利用された型番は自動では訂正できない。識別子矛盾は停止・レビュー対象とする。
- 検索queryのcategory/subcategoryはissue policyに使用するため、検索マスタの分類誤りが判定へ影響する。
- canonical keyフォールバックでは、似た別商品の過剰統合や表記揺れによる分割の可能性が残る。
- メーカー公式情報との自動照合は行っていない。
- `null`は不明を意味し、全年齢・全種対応を意味しない。

ルール追加時は、`normalization_aliases_seed.csv`と`normalizationAliases.test.ts`、または`normalizeListing.test.ts`・`issuePolicy.test.ts`へ代表ケースを追加し、seed、対象rawの再process、`npm run test:pet-catalog`、`npm run quality:pet-catalog`を実行する。
