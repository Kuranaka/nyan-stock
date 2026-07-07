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

- Appカテゴリを決める。候補: `Lifestyle` または `Productivity`
- 年齢制限を確認する。医療・診断アプリではない前提で回答する。
- サポートURLを用意する。
- マーケティングURLを用意する場合はLPを指定する。
- プライバシーポリシーURLを正式な公開URLにする。
- スクリーンショットを用意する。
  - iPhone 6.7 inch
  - iPhone 6.5 inch
  - iPhone 5.5 inchが必要になる場合は追加
- レビュー用メモに、ログインなしでも基本機能を確認できることを書く。
- 共有同期を確認してほしい場合は、レビュー用アカウントまたは共有コードの手順を用意する。

## Privacy Nutrition Labels

実装に合わせ、少なくとも以下を確認してください。

- ユーザーコンテンツ: 猫プロフィール、在庫、購入履歴、商品リンク、メモ
- 識別子: Supabase user id、匿名ゲストID、OAuth provider user id
- 連絡先情報: Google / Appleログインでメールアドレスを取得する場合あり
- 購入: 外部ECサイトでの購入自体はアプリ内で処理しない
- 位置情報: 取得しない
- 健康とフィットネス: 獣医療上の診断情報を目的として取得しない
- トラッキング: 広告SDKやIDFAを入れるまでは原則なし

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

## Legal Copy

- アプリ内のプライバシーポリシーを最終レビューする。
- アプリ内の利用規約を最終レビューする。
- アフィリエイト表示を最終レビューする。
- LP側の `/privacy`, `/terms`, `/affiliate` も同じ方針で更新する。
- 医療・診断・治療を示すコピーがないか確認する。

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
本アプリは獣医療上の診断、治療、予防、助言を行うものではありません。
商品リンクにはアフィリエイトリンクが含まれる場合があります。
```

