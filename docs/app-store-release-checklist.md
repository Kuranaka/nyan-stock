# App Store Release Checklist

にゃんストック iOS版をApp Storeへ提出する前の確認メモです。

## App Identity

- App name: `にゃんストック`
- Bundle ID: `com.nyanstock.app`
- URL scheme: `nyanstock`
- Current version: `1.0.0`
- Current iOS build number: `1`

Apple Developer / App Store Connectで別のBundle IDを使う場合は、`apps/mobile/app.json` の `ios.bundleIdentifier` と、Supabase OAuthのリダイレクト設定を同時に更新してください。

## App Store Connect

- Appカテゴリを決める。推奨: `Lifestyle`、副カテゴリ候補: `Productivity`
- 年齢制限を確認する。想定: 4+
- サポートURLを用意する。草案は `docs/app-store-metadata.md` を参照。
- マーケティングURLを用意する場合はLPを指定する。
- プライバシーポリシーURLを正式な公開URLにする。
- 利用規約URLとアフィリエイト開示URLを正式な公開URLにする。
- スクリーンショットを用意する。
  - iPhone 6.7 inch
  - iPhone 6.5 inch
  - iPhone 5.5 inchが必要になる場合は追加
- レビュー用メモに、ログインなしでも基本機能を確認できることを書く。
- 共有同期を確認してほしい場合は、レビュー用アカウントまたは共有コードの手順を用意する。
- App Store用説明文、キーワード、レビュー用メモの草案は `docs/app-store-metadata.md` に保存済み。

## RevenueCat / Subscriptions

- RevenueCatでiOSアプリを作成する。
- Entitlement `nyanstock_plus` を作成する。
- Offering `default` を作成する。
- App Store Connectでサブスクリプション商品を作成する。
  - Monthly: `nyan_stock_plus_monthly`
  - Annual: `nyan_stock_plus_annual`
- RevenueCatのOfferingに月額・年額商品を紐づける。
- 商品を `nyanstock_plus` entitlementに紐づける。
- App Store ConnectのIn-App Purchase KeyをRevenueCatに登録する。
- `apps/mobile/.env` に `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` を設定する。
- `EXPO_PUBLIC_REVENUECAT_PLUS_ENTITLEMENT_ID=nyanstock_plus` を確認する。
- RevenueCat未設定時にクラッシュしないことを確認する。
- TestFlight / Sandboxで購入と復元を確認する。
- 再起動後も購入済みユーザーがPlus扱いになることを確認する。

## Plan Behavior

- 無料プラン
  - 猫プロフィール: 2匹まで
  - 在庫登録: 10件まで
  - 広告: 表示あり
  - 家族共有、購入履歴、月別費用レポート、複数端末同期: 無料のまま
- Plus
  - 猫プロフィール: 無制限
  - 在庫登録: 無制限
  - 広告: 非表示
- 課金画面に価格、購入、復元、サブスクリプション管理導線が表示されること。

## Privacy Nutrition Labels

実装に合わせ、少なくとも以下を確認してください。

- ユーザーコンテンツ: 猫プロフィール、在庫、購入履歴、商品リンク、メモ
- 識別子: Supabase user id、匿名ゲストID、OAuth provider user id
- 連絡先情報: Google / Appleログインでメールアドレスを取得する場合あり
- 購入: Plusの購読状態、商品ID、RevenueCat subscriber id。外部ECサイトでの猫用品購入自体はアプリ内で処理しない
- 広告関連データ: 広告SDKを有効化する場合はAdMobのデータ利用に合わせて入力する
- 通知設定: ローカル通知の設定
- 位置情報: 取得しない
- トラッキング: IDFAや他社アプリ/サイト横断のトラッキング広告を使わない構成に寄せる場合は原則なし。AdMob設定とApp Store Privacy回答を必ず一致させる

## Sign in with Apple / Supabase

- Apple Developerで `com.nyanstock.app` のApp IDを作成する。
- App IDでSign in with Appleを有効化する。
- Supabase AuthのApple providerを本番Apple Developer情報で設定する。
- Supabase AuthのGoogle providerを本番OAuth clientで設定する。
- Supabase Authのredirect URLに `nyanstock://auth/callback` を登録する。
- `EXPO_PUBLIC_SUPABASE_URL` と `EXPO_PUBLIC_SUPABASE_ANON_KEY` が本番プロジェクトを指していることを確認する。
- Anonymous Authを使う場合は、Supabaseで匿名ログインを有効化する。

## Permissions

`apps/mobile/app.json` で説明文を設定済みです。

- Camera: JANコード読み取りのため
- Photo Library: 猫や商品のアイコン画像選択のため
- Notifications: 在庫切れ前のローカル通知のため

提出前確認:

- バーコード機能を初回リリースで出さない場合、Camera権限とバーコード画面の露出を外すか、説明文・レビュー手順と一致させる。
- Android / Google Play / Google Billingは初回iOSリリースでは対象外。Android向け権限と課金設定は別タスクで確認する。

## Legal Copy

- アプリ内のプライバシーポリシーを最終レビューする。
- アプリ内の利用規約を最終レビューする。
- アフィリエイト表示を最終レビューする。
- LP側の `/privacy`, `/terms`, `/affiliate` も同じ方針で更新する。

## Ads / Affiliate

- 初回リリースで広告SDKを入れない場合、App Store Connectのプライバシー回答も広告SDKなしで揃える。
- 商品リンク・検索結果の近くにアフィリエイト表示が出ることを確認する。
- 外部ECサイトでの価格、在庫、配送、返品は各サイト側の責任であることを説明する。

## Build Verification

`apps/mobile/` で実行します。

```bash
npx tsc --noEmit
npm run lint
npx expo export --platform ios
```

実機またはSimulatorで確認します。

- 初回起動でオンボーディングが表示される。
- 猫プロフィールを保存できる。
- 在庫を作成・編集・削除できる。
- 残り日数とステータスが変わる。
- 補充で購入履歴が作られる。
- 通知許可の説明が表示される。
- カメラ権限の説明が表示される。
- 写真選択の説明が表示される。
- Google / Appleログインが成功する。
- 共有コードを作成・参加できる。
- データ初期化で確認ダイアログが出る。
- リリースビルドで開発用データと未実装TODOが表示されない。

## Submission Notes Draft

```text
にゃんストックは、猫用品の在庫、残り日数、購入履歴、商品リンクを記録するアプリです。
ログインなしでも基本機能を確認できます。
GoogleまたはAppleログインを行うと、共有コードを使った家族・他アカウントとの在庫共有を利用できます。
Plusは広告非表示と、猫プロフィール・在庫登録数の上限解除を提供します。
無料プランでは猫プロフィール2匹、在庫10件まで登録できます。
家族共有、購入履歴、月別費用レポート、複数端末同期は無料プランでも利用できます。
アプリ内に購入復元導線があります。購入画面から復元できます。
商品リンクにはアフィリエイトリンクが含まれる場合があります。
```
