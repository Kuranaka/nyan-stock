# App Store Release Checklist

にゃんストック iOS版をApp Storeへ提出する前の確認メモです。

## App Identity

- App name: `にゃんストック`
- Bundle ID: `com.nyanstock.app`
- URL scheme: `nyanstock`
- Current version: `2.0.0`
- Current local iOS build number: `19`（提出時はEASのリモート採番を確認）

Apple Developer / App Store Connectで別のBundle IDを使う場合は、`apps/mobile/app.json` の `ios.bundleIdentifier` と、Supabase OAuthのリダイレクト設定を同時に更新してください。

## App Store Connect

- Appカテゴリを決める。推奨: `Lifestyle`、副カテゴリ候補: `Productivity`
- 年齢制限を確認する。想定: 4+
- サポートURLを用意する。草案は `docs/app-store-metadata.md` を参照。
- マーケティングURLを用意する場合はLPを指定する。
- プライバシーポリシーURLを正式な公開URLにする。
- 利用規約URLとアフィリエイト開示URLを正式な公開URLにする。
- スクリーンショットを用意する。
  - iPhone 6.9 inch
  - iPad 13 inch（`supportsTablet: true`のため必須）
  - iPhone 6.9 inchを用意しない場合は6.5 inch
  - 提出時点の[Apple公式スクリーンショット仕様](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/)でピクセル寸法を再確認
- レビュー用メモに、メールアドレスの入力なしで匿名ゲストとして基本機能を確認できることを書く。
- 共有同期を確認してほしい場合は、レビュー用アカウントまたは共有コードの手順を用意する。
- App Store用説明文、キーワード、レビュー用メモの草案は `docs/app-store-metadata.md` に保存済み。

## RevenueCat / Subscriptions

- RevenueCatでiOSアプリを作成する。
- Entitlement `nyanstock_plus` を作成する。
- App Store Connectで月額・年額のサブスクリプション商品を作成し、product ID、期間、価格を確定する。
- RevenueCatのCurrent Offeringに月額・年額商品を紐づける。アプリはOffering identifierやproduct IDを固定せず、Current Offeringから取得する。
- 商品を `nyanstock_plus` entitlementに紐づける。
- App Store ConnectのIn-App Purchase KeyをRevenueCatに登録する。
- `apps/mobile/.env` に `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` を設定する。
- `EXPO_PUBLIC_REVENUECAT_PLUS_ENTITLEMENT_ID=nyanstock_plus` を確認する。
- RevenueCat未設定時にクラッシュしないことを確認する。
- TestFlight / Sandboxで購入と復元を確認する。
- 購入画面の期間と価格がApp Store Connectの登録値と一致することを確認する。
- 再起動後も購入済みユーザーがPlus扱いになることを確認する。

## Plan Behavior

- 無料プラン
  - ペットプロフィール: 2匹まで
  - 在庫登録: 10件まで
  - 広告: 表示あり
  - 家族共有、購入履歴、費用ダッシュボード、複数端末同期: 無料のまま
- Plus
  - ペットプロフィール: 無制限
  - 在庫登録: 無制限
  - 広告: 非表示
- 課金画面にサブスクリプション名、期間、価格、購入、復元、サブスクリプション管理導線が表示されること。
- 課金画面のプライバシーポリシーと利用規約のリンクが、実際の公開ページをアプリ内ブラウザで開くこと。
- App Store ConnectのプライバシーポリシーURL欄に `https://nyanstock.com/privacy` を設定すること。
- App Store Connectのアプリ説明またはEULA欄に、利用規約 `https://nyanstock.com/terms` への機能するリンクを記載すること。

## Privacy Nutrition Labels

App Store Connectの回答は、現行実装と第三者SDKを含めて整理した `docs/privacy-disclosure-2.0.md` を正本とします。提出画面へ転記する際は、独自の解釈で項目を省略しません。

- ゲスト開始時もSupabaseの匿名ユーザーIDを作成する。
- 商品登録時の商品マスタ改善用データ送信は廃止済み。提出前に停止migrationを本番Supabaseへ適用する。
- 旧版から過去に送信された商品マスタ改善用データは現時点で保持されている場合があるため、アカウント削除・削除依頼時の削除を本番で確認する。
- 商品検索等の検索語・商品URLは認証済みリクエスト内で処理され、運用ログ等から紐付く可能性があるため、検索履歴・閲覧履歴を「ユーザーに紐付く」と回答する。
- Google / Appleログインでは、メールアドレス等を取得する場合がある。
- RevenueCatがPlusの購入・購読情報を処理する。
- Resendがアプリ内お問い合わせの新着通知に必要な最小限の情報を処理する。
- Google AdMob / UMPがデバイスID、IPアドレスから推定されるおおよその位置、広告・操作・診断情報を処理する場合がある。
- 現行構成では、App Store ConnectのデバイスIDを「トラッキングに使用」と回答する。
- 外部ECサイトで入力される決済情報は本アプリが取得しない。
- 【公開ブロッカー】Privacy Manifestの追跡ドメイン確認を完了し、`NSPrivacyTracking`と`NSPrivacyTrackingDomains`を現行ATT実装へ一致させてから提出する。ドメイン未確定の状態では提出しない。

## Sign in with Apple / Supabase

- Apple Developerで `com.nyanstock.app` のApp IDを作成する。
- App IDでSign in with Appleを有効化する。
- Supabase AuthのApple providerを本番Apple Developer情報で設定する。
- Supabase AuthのGoogle providerを本番OAuth clientで設定する。
- Supabase Authのredirect URLに `nyanstock://auth/callback` を登録する。
- `EXPO_PUBLIC_SUPABASE_URL` と `EXPO_PUBLIC_SUPABASE_ANON_KEY` が本番プロジェクトを指していることを確認する。
- ゲスト開始でAnonymous Authを使うため、Supabaseで匿名ログインを有効化する。

## Permissions

`apps/mobile/app.json` で説明文を設定済みです。

- Photo Library: ペットや商品のアイコン画像選択のため
- Notifications: 在庫切れ前のローカル通知のため
- Tracking Transparency: 広告のパーソナライズと効果測定の許可確認のため

提出前確認:

- Android / Google Play / Google Billingは初回iOSリリースでは対象外。Android向け権限と課金設定は別タスクで確認する。

## Legal Copy

- `docs/privacy-disclosure-2.0.md` を正本として、アプリ内とWebのプライバシーポリシーを最終レビューする。
- アプリ内とWebのポリシーで、保持期間、削除後のバックアップ・ログ、委託先の同等以上の保護・監督、Resend、旧版の商品マスタ改善用データ、検索語・商品URLの識別可能性が同じ内容になっていることを確認する。
- アプリ内の利用規約を最終レビューする。
- アフィリエイト表示を最終レビューする。
- LP側の `/privacy`, `/terms`, `/affiliate` も同じ方針で更新する。

## Ads / Affiliate

- 無料プランのGoogle AdMob / UMPとATTの現行挙動を、公開ポリシー、Privacy Manifest、App Store Connectの回答に一致させる。
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
- ペットプロフィールを保存できる。
- 在庫を作成・編集・削除できる。
- 残り日数とステータスが変わる。
- 補充で購入履歴が作られる。
- 通知許可の説明が表示される。
- 写真選択の説明が表示される。
- 必要な条件でATTの説明が表示される。
- Google / Appleログインが成功する。
- 共有コードを作成・参加できる。
- ゲストでも発行済み共有コードで参加でき、共有スペースの作成にはGoogleまたはAppleログインが必要である。
- データ初期化で確認ダイアログが出る。
- リリースビルドで開発用データと未実装TODOが表示されない。

## Submission Notes

App Review Notesは `docs/app-store-metadata.md` の「Review Notes」を正本とし、App Store Connectへ転記する直前に共有、Plus、アカウント削除の実機手順と一致することを確認します。
