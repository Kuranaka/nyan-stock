# Cloudflare Pages デプロイ

このLPは静的エクスポートで `out/` に出力されます。Cloudflare Pages の Git 連携を使うと、main ブランチへの push ごとに公開できます。

## Cloudflare Dashboard の設定

1. **Workers & Pages** から **Create application** を選び、**Pages** を選択します。
2. GitHub の `Kuranaka/nyan-stock` を接続します。
3. 以下を設定します。

| 項目 | 値 |
| --- | --- |
| Production branch | `main` |
| Root directory | `apps/web` |
| Build command | `npm ci && npm run build` |
| Build output directory | `out` |

4. Pages の **Settings > Environment variables** に、Production と Preview の両方で次を設定します。

```text
NEXT_PUBLIC_SITE_URL=https://nyanstock.com
NEXT_PUBLIC_SUPPORT_EMAIL=support@nyanstock.com
```

5. **Custom domains** で独自ドメインを追加します。DNS を Cloudflare で管理している場合は案内に従ってレコードを設定します。

## 公開後の確認

- `https://nyanstock.com/`
- `https://nyanstock.com/privacy`
- `https://nyanstock.com/terms`
- `https://nyanstock.com/affiliate`
- `https://nyanstock.com/support`（メール窓口またはアプリ内「設定 > お問い合わせ」の案内を表示）
- `https://nyanstock.com/app-ads.txt`（HTTP 200、`Content-Type: text/plain`）

`www.nyanstock.com` も独自ドメインとして追加し、`nyanstock.com` へのリダイレクトを
設定するか、同じ Pages プロジェクトに紐付けてください。これにより
`/app-ads.txt` も両方のホスト名で取得できます。

Google OAuth の確認申請では、同じ独自ドメインを Google Search Console で確認し、ホームページとプライバシーポリシーのURLに上記の公開URLを指定してください。

## 制約

現行LPは静的サイトです。将来、Next.js Route Handler、サーバーサイド認証、フォーム送信APIなどを追加する場合は、Cloudflare Workers + OpenNext へ移行するか、外部APIを利用してください。
