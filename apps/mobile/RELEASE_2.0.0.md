# にゃんストック 2.0.0 公開準備

作成日: 2026年7月26日

## バージョン

- ユーザー向けバージョン: `2.0.0`
- Bundle ID / Application ID: `com.nyanstock.app`（既存アプリから変更なし）
- EAS Project ID: `8324fb83-b5d9-4396-91ce-d67a97d848e6`（変更なし）
- ビルド番号: EASのremote version + `autoIncrement`を正とする
- ローカルの予備値: iOS `19`、Android `2`
- 2026年7月26日に確認したEASのiOS remote build number: `20`（次のTestFlight候補は`21`以上）

公開候補を作る前に、EASに保存された現在値を読み取り、次のビルド番号が既存のApp Store / Google Playビルドを上回ることを確認します。

```bash
cd apps/mobile
npx eas-cli build:version:get --platform ios --profile testflight
npx eas-cli build:version:get --platform android --profile production
```

## App Store「このバージョンの新機能」案

```text
にゃんストックを、いろいろなペットとの暮らしに使いやすくリニューアルしました。

・犬、猫、うさぎ、小動物、鳥、観賞魚、爬虫類・両生類、昆虫に対応
・ペット登録と商品登録の入力項目を整理
・補充履歴から買い足し時期を自動で学習
・在庫画面で「学習中」「日数表示なし」を分かりやすく表示
・今月の支出、月額予測、今後30日の買い足し見込みを確認できる費用画面を追加
・月ごとの購入履歴と価格未入力の修正導線を改善
・画面全体のレイアウトと操作性を見直し
```

## 検証と提出の正本

同じ確認を複数のファイルで管理せず、次の正本へ結果と証跡を集約します。

- 手動スモークテスト、P0 / P1、Go / No-Go:
  [SMOKE_TEST_2.0.0.md](./SMOKE_TEST_2.0.0.md)
- 外部サービス設定とApp Store Connect入力:
  [APP_STORE_SUBMISSION_CHECKLIST.md](./APP_STORE_SUBMISSION_CHECKLIST.md)
- ストア説明文とApp Review Notes:
  [app-store-metadata.md](../../docs/app-store-metadata.md)
- App Privacy申告:
  [privacy-disclosure-2.0.md](../../docs/privacy-disclosure-2.0.md)

### 現在のリリース判定

- [x] ユーザー向けバージョンを`2.0.0`へ統一
- [x] EASのremote version / auto incrementを維持
- [x] TestFlight / productionビルドのSupabase認証方式をPKCEへ固定
- [x] 広告SDKの起動時計測を遅延し、Plus判定・UMP・ATT完了前の計測開始を防止
- [ ] リリース候補commitで自動検証を再実行
- [ ] Simulator段階のP0 / P1を完了
- [ ] TestFlight実機段階のP0 / P1を完了
- [ ] 外部サービス設定とApp Store Connect入力を完了
- [ ] [SMOKE_TEST_2.0.0.md](./SMOKE_TEST_2.0.0.md)のGo基準をすべて満たす

2026年7月26日のEAS設定読み取りでは、production環境に
`RELEASE_SUPABASE_PROJECT_REF`が未登録でした。次のstore buildは環境検証で停止するため、
本番Supabase URLのproject refと一致する値をEAS production環境へ登録してから作成します。
また、Google Mobile Adsの追跡ドメインが未確定の間は、公開ビルド検証が
`NSPrivacyTracking`と`NSPrivacyTrackingDomains`の不足を検出して停止します。

Androidを同時公開する場合は、GoogleのサンプルAdMob App IDを本番IDへ置き換え、本番署名のEAS productionビルドを使用します。

## 外部操作（明示確認後に実行）

```bash
cd apps/mobile
npm run build:ios:testflight
npm run submit:ios:testflight
```

TestFlightで最終確認後、同じビルドをApp Store審査へ提出します。
