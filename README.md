# にゃんストック

猫を中心に、犬・うさぎ・小動物・鳥・観賞魚・爬虫類／両生類・昆虫の用品を管理するアプリ「にゃんストック」のモノレポです。

モバイルアプリは、用品の残り日数、補充・購入履歴、費用、ローカル通知、購入先リンクを管理します。通常の端末内データはAsyncStorageへ保存し、Google／Apple／ゲスト認証とSupabaseを使った家族共有にも対応しています。WebアプリはApp Store向けの公開LPと法務・サポートページです。

## リポジトリ構成

```text
nyan-stock/
  apps/
    mobile/                  Expo / React Native アプリ
    web/                     Next.js 公開サイト
  packages/
    shared/                  商品・ペットマスターの共有型
  services/
    product-importer/        商品マスター収集・正規化・品質検査CLI
  supabase/
    functions/               Edge Functions
    migrations/              追記専用DB migration
  artifacts/                 ストア画像・プレビューの採用済み成果物
```

各アプリ／サービスは個別の`package.json`、lockfile、`node_modules`を持ちます。リポジトリルートで`npm install`は実行しません。

## モバイルアプリ

- Expo SDK 54 / React Native 0.81 / React 19
- Expo Router
- TypeScript strict mode
- AsyncStorage（version付きJSON、スキーマ検証、旧形式からの自動移行）
- Supabase Auth / PostgREST / Realtimeによる家族共有
- Expo Notifications
- RevenueCat / AdMob

```bash
cd apps/mobile
npm install
npx expo start
npm test
npm run verify:release
```

`verify:release`は設定検証、型検査、Lint、自動テスト、購入頻度検証、セキュリティ検証を実行します。ルーティングやネイティブ設定を変更した場合は、追加で次を実行します。

```bash
npx expo export --platform ios
```

### TestFlight配布

Bundle IDは`com.nyanstock.app`です。EASの`testflight`プロファイルはストア配布、本番環境、ビルド番号の自動採番を使用します。

```bash
cd apps/mobile
npx eas-cli login
npm run build:ios:testflight
npm run submit:ios:testflight
```

本番用のSupabase、RevenueCat、AdMob設定はEASの`production` environmentへ登録します。`EXPO_PUBLIC_`値はアプリへ埋め込まれるため、service-role keyなどの秘密情報は登録しません。

## Webサイト

- Next.js 16 / React 19 / Tailwind CSS
- App Router
- Cloudflare Pages向け静的export（`out/`）

```bash
cd apps/web
npm install
npm run dev
npm run lint
npx tsc --noEmit
npm run build
```

本番ビルドには次の環境変数が必須です。未設定、localhost、非HTTPS URL、不正なメール形式は`prebuild`で失敗します。

```text
NEXT_PUBLIC_SITE_URL=https://nyanstock.com
NEXT_PUBLIC_SUPPORT_EMAIL=support@nyanstock.com
```

Cloudflare PagesではRoot directoryを`apps/web`、Build commandを`npm ci && npm run build`、Output directoryを`out`に設定します。詳細は[apps/web/CLOUDFLARE_PAGES.md](apps/web/CLOUDFLARE_PAGES.md)を参照してください。

## 商品インポーター

```bash
cd services/product-importer
npm install
npm run build
npm run test:pet-catalog
```

収集、正規化、レビュー、マージ、品質検査の各コマンドは[services/product-importer/README.md](services/product-importer/README.md)を参照してください。大規模テーブルは対象を絞ったクエリとkeyset paginationを使用します。

## Supabase

- 適用済みmigrationは編集せず、必ずより新しいversionのmigrationを追加します。
- 家族共有の在庫・履歴変更は、対象IDだけを更新するRPCを使います。全件置換で別端末の変更を消さないようにします。
- ローカルSupabase設定は`supabase/config.toml`、開発／本番環境の設定は各Supabase Dashboardで個別に管理します。

## Gitと生成物

一時的な動画編集、export、ストア画像の中間生成物は`.gitignore`対象です。採用済みの大きな動画と商品インポーターの生成成果物は`.gitattributes`でGit LFS対象にしています。

Git LFSを利用する環境では、ファイルを追加する前にGit LFSをインストールし、追跡済みの対象ファイルも一度だけ正規化します。

```bash
git lfs install
git add --renormalize artifacts services/product-importer/data/generated
git lfs ls-files
```

この操作は次のcommitからLFSポインターへ切り替えるもので、過去のGitオブジェクトまでは削減しません。既存履歴のLFS移行は履歴を書き換えるため、通常の機能変更とは分けて実施します。
