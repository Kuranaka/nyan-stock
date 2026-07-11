# にゃんストック

猫用品の在庫管理・買い忘れ防止アプリ「にゃんストック」のモノレポです。

## リポジトリ構成

```text
nyan-stock/
  apps/
    mobile/
      package.json
      app.json
      src/
      app/
    web/
      package.json
      next.config.ts
      src/
      app/
  README.md
```

- `apps/mobile`: React Native / Expo / TypeScript のアプリ本体
- `apps/web`: Next.js / TypeScript / Tailwind CSS のLP
- 共通化はまだ行わず、将来的に `packages/shared` へ型や定数を切り出せる構成にしています。

## モバイルアプリ

```bash
cd apps/mobile
npm install
npx expo start
```

## LP

```bash
cd apps/web
npm install
npm run dev
```

## Cloudflare Pages 公開設定

Cloudflare PagesでLPを公開する場合は、GitHubリポジトリを接続し、Root Directoryに以下を指定してください。

```text
apps/web
```

Build Command:

```bash
npm ci && npm run build
```

Output Directory:

```text
out
```

詳細は [apps/web/CLOUDFLARE_PAGES.md](apps/web/CLOUDFLARE_PAGES.md) を参照してください。

## 注意点

- ルート直下で `npm install` しない
- ルート直下にNext.jsの `app/` を作らない
- ルート直下にExpoの `app/` を作らない
- `apps/mobile` と `apps/web` を混ぜて編集しない
- LPの変更は `apps/web`
- アプリ本体の変更は `apps/mobile`
