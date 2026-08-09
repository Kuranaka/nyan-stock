# にゃんストック 2.0.1 公開準備

作成日: 2026年8月9日

## バージョン

- ユーザー向けバージョン: `2.0.1`
- Bundle ID: `com.nyanstock.app`（変更なし）
- EAS Project ID: `8324fb83-b5d9-4396-91ce-d67a97d848e6`（変更なし）
- ビルド番号: EASのremote versionと`autoIncrement`を正とする
- 2026年8月9日に確認したEASのiOS remote build number: `20`（次の候補は`21`以上）
- Android公開: 今回は対象外

公開候補を作る直前に、EASの現在値とApp Store Connectの既存ビルド番号を比較します。

```bash
cd apps/mobile
npx eas-cli build:version:get --platform ios --profile testflight
```

## 2.0.1の主な変更

- 家族共有中の在庫削除、履歴削除、補充保存を対象ID指定の原子的更新へ変更
- 共有履歴が1,000件を超えても全件取得できるkeyset paginationを追加
- 共有データをオフラインで読めない場合の説明と再読込導線を追加
- AsyncStorageへversion、スキーマ検証、旧形式移行、破損データの復旧用退避を追加
- 費用、履歴、在庫詳細、設定画面の共通hooks/componentsを分離
- 在庫計算、削除計画、ページング、永続化の自動テストを追加
- Web本番ビルドのURL・問い合わせメール必須検証を追加

「使い切る日数」は開封日入力がない現行仕様に合わせ、購入日基準のまま変更していません。

## App Store「このバージョンの新機能」案

```text
家族での在庫管理を、より安心して使えるよう改善しました。

・複数端末からの削除や補充でデータが食い違いにくくなるよう同期処理を改善
・購入履歴が多い場合もすべて読み込めるよう対応
・共有データをオフラインで表示できない場合の案内と再読込を追加
・端末内データの保存と移行処理を強化
・在庫、購入履歴、費用画面の安定性を改善
```

## バックエンド適用順序

2.0.1の共有更新は次のRPCを使用します。アプリのTestFlight配布より先に、開発・本番の両Supabaseへ新しいmigrationを適用してください。

```text
supabase/migrations/20260808000000_atomic_household_inventory_mutations.sql
```

適用後は、`authenticated`だけが`apply_household_inventory_mutation`を実行でき、非参加者のhousehold IDが拒否されることを確認します。migration未適用の環境へ2.0.1を配布すると、共有中の補充・対象削除が失敗するため提出不可です。

## 自動検証

リリース候補commitから次を実行します。

```bash
cd apps/mobile
npm run verify:release
npx expo export --platform ios

cd ../web
npm run validate:env
npx tsc --noEmit
npm run lint
npm run build
```

2026年8月9日の作業ツリーでは、モバイルのrelease検証（型検査、Lint、17テスト、購入頻度・セキュリティ検証）、iOS export、Webの環境検証・型検査・Lint・本番build、plist構文検証が成功しています。提出候補commitを確定したあと、同じ検証を再実行して証跡へ残します。

## 手動検証と提出

- 2.0.1固有の回帰確認とGo / No-Go: [SMOKE_TEST_2.0.1.md](./SMOKE_TEST_2.0.1.md)
- 外部サービス設定とApp Store Connect入力: [APP_STORE_SUBMISSION_CHECKLIST.md](./APP_STORE_SUBMISSION_CHECKLIST.md)
- ストア説明文とReview Notes: [app-store-metadata.md](../../docs/app-store-metadata.md)
- App Privacy申告: [privacy-disclosure-2.0.md](../../docs/privacy-disclosure-2.0.md)

## 現在のリリース判定

- [x] ソース上のversionを`2.0.1`へ統一
- [x] EASのremote version / auto incrementを維持
- [x] Android公開設定は変更せず、今回の対象外と明記
- [x] 新migrationを開発Supabaseへ適用（2026年8月9日、local/remote一致を確認）
- [x] 新migrationを本番Supabaseへ適用（2026年8月9日、local/remote一致を確認）
- [ ] 2アカウント・2端末で共有回帰テストを完了
- [ ] リリース候補commitで自動検証を再実行
- [ ] SimulatorとTestFlight実機のP0 / P1を完了
- [ ] EASの次回iOS build番号が既存ビルドより大きいことを確認
- [ ] App Store Connectの「このバージョンの新機能」を確定
- [ ] [SMOKE_TEST_2.0.1.md](./SMOKE_TEST_2.0.1.md)のGo基準を満たす

2026年8月9日のEAS設定読み取りでも、production環境に`RELEASE_SUPABASE_PROJECT_REF`は登録されていません。また、iOS Privacy Manifestは`NSPrivacyTracking=false`で追跡ドメインが未確定です。現在の`validate-release-env.mjs`はこの2点が解消されるまでstore buildを停止するため、現時点の判定はNo-Goです。

## 外部操作

TestFlightビルド作成・送信は、上の事前条件を満たしたあとに明示的に実行します。

```bash
cd apps/mobile
npm run build:ios:testflight
npm run submit:ios:testflight
```
