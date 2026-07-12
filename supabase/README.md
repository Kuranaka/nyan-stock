# Supabase 運用メモ

## 本番・開発環境の分離

Supabase は **開発用** と **本番用** に別々のプロジェクトを作成します。開発用アプリ、ローカルのインポーター、検証用 Edge Function から本番プロジェクトを参照しないでください。両プロジェクトへ同じ `supabase/migrations/` を適用し、Auth provider、Storage bucket、Edge Function の設定もそれぞれに作成します。

### モバイルアプリ

- ローカル開発では `apps/mobile/.env.development.example` を `apps/mobile/.env.development.local` にコピーし、**開発用** プロジェクトの URL と anon key を設定します。Expo は `npx expo start` 時にこのファイルを読み込みます。
- EAS の Environment variables に `development` と `production` を作成し、各環境に `EXPO_PUBLIC_APP_ENV`、`EXPO_PUBLIC_SUPABASE_URL`、`EXPO_PUBLIC_SUPABASE_ANON_KEY` と必要な `EXPO_PUBLIC_SUPABASE_*` を設定します。`apps/mobile/eas.json` は development / preview を `development`、production を `production` に固定済みです。
- 本番 URL や本番 anon key をローカルの `.env.development.local` に書かないでください。`EXPO_PUBLIC_` の値はアプリへ埋め込まれるため、service-role key などの秘密情報も絶対に入れません。

EAS CLI を使う場合は、環境ごとに値を登録します（値はダッシュボードで入力しても構いません）。

```bash
cd apps/mobile
eas env:create --environment development --name EXPO_PUBLIC_APP_ENV --value development --visibility plaintext
eas env:create --environment production --name EXPO_PUBLIC_APP_ENV --value production --visibility plaintext
eas build --profile development
eas build --profile production
```

### Supabase CLI と Edge Functions

`supabase link` のリンク状態は1プロジェクト分だけです。操作ごとに対象 ref を明示し、開発・本番を取り違えないでください。以下の `<dev-ref>` と `<prod-ref>` は Supabase Dashboard の project ref に置き換えます。

```bash
# 開発環境へ migration / function を反映
supabase db push --project-ref <dev-ref>
supabase functions deploy purchase-link-search --project-ref <dev-ref>

# 本番環境へ反映（リリース時だけ実行）
supabase db push --project-ref <prod-ref>
supabase functions deploy purchase-link-search --project-ref <prod-ref>
```

### 外部APIを呼ぶ関数の認証・利用制限

`purchase-link-search` は匿名キーだけでは利用できません。Google、Apple、またはゲストアカウントのアクセストークンを必須とします。アカウントのないリクエストは拒否します。`api_rate_limit_windows` と `consume_api_rate_limit` は、同一ユーザーの全保護エンドポイントを合算して次を原子的に適用します。

| 制限 | 値 |
| --- | --- |
| 1分 | 20回 |
| 1日（UTC） | 500回 |

上限超過時は HTTP 429 と `Retry-After` を返します。migration を適用してから Edge Function をデプロイしてください。将来 `/ai/*`、`/notifications/send`、`/admin/*` を追加する場合も、関数の先頭で同じ認証確認と `consume_api_rate_limit` を呼び、クライアントから外部APIキーへ直接到達できないようにします。

ただし、保存済みの購入URLを開くための `mode=affiliate` は上限超過時にも HTTP 200 で元のURLを返します。このフォールバックではアフィリエイトIDを付与せず、外部APIも呼び出しません。

`supabase secrets set`、Database Webhook、OAuth Redirect URLs、Resend や商品検索 API のキーも、必ず対象プロジェクトごとに設定します。本番の service-role key はローカル開発環境に保存せず、アクセスを制限したデプロイ環境だけで使います。

### Product importer

インポーターは `PRODUCT_IMPORTER_ENV`（既定値: `development`）に応じて `services/product-importer/.env.<環境名>` を読み込みます。開発では `.env.development.example` を `.env.development` にコピーします。本番投入は CI などの限定環境で `PRODUCT_IMPORTER_ENV=production npm run import:products` として実行し、`.env.production` または環境変数に本番接続情報を与えます。

既存の `.env` は移行期間だけフォールバックとして読み込みます。移行後は削除し、環境名付きファイルだけを使ってください。

## 問い合わせメール通知

`support-inquiry-notify` Edge Function は、データベースに追加された問い合わせを検知し、`support@nyanstock.com` に新着通知を送ります。本文そのものはメールに含めず、Supabase Table Editor で確認します。

### 初回設定

1. Resend で `nyanstock.com` をドメイン認証し、`notifications@nyanstock.com` から送信できる状態にします。
2. Resend の API キーと、十分に長いランダム値の Webhook シークレットを Supabase に設定します。値はリポジトリやモバイルアプリの環境変数には入れません。

   ```bash
   supabase secrets set RESEND_API_KEY=... SUPPORT_INQUIRY_WEBHOOK_SECRET=...
   ```

3. 関数をデプロイします。

   ```bash
   supabase functions deploy support-inquiry-notify --no-verify-jwt
   ```

4. **Supabase Dashboard の SQL Editor を開き、次のSQLを実行して** `support_inquiry_notify_url` と `support_inquiry_webhook_secret` を Supabase Vault に保存します。URLの `<project-ref>` は Dashboard の **Settings > General** に表示されます。Webhook シークレットには手順2で設定した `SUPPORT_INQUIRY_WEBHOOK_SECRET` と同じ値を使用します。

   ```sql
   select vault.create_secret(
     'https://<project-ref>.supabase.co/functions/v1/support-inquiry-notify',
     'support_inquiry_notify_url'
   );

   select vault.create_secret(
     '<SUPPORT_INQUIRY_WEBHOOK_SECRET と同じ値>',
     'support_inquiry_webhook_secret'
   );
   ```

5. `supabase/migrations/20260712000002_support_inquiry_notifications.sql` を適用します。通常はリンク済み環境から `supabase db push` を実行します。CLIを使わない場合は、**Supabase Dashboard の SQL Editor に同ファイルの内容を貼り付けて実行します**。このSQLは `support_inquiries` と `product_link_reports` の `INSERT` トリガーを作成します。

6. アプリからテスト送信し、`support@nyanstock.com` への通知と Table Editor の登録を確認します。

問い合わせと商品情報の報告は、合わせて1アカウントあたり **10分に1件・1日10件** までです。`20260712000003_support_inquiry_rate_limit.sql` から `20260712000006_product_link_report_rate_limit.sql` を適用すると、回数制限の確認と登録が同じトランザクションで行われ、クライアントからの直接登録はできなくなります。上限時には、アプリに「お問い合わせ・商品情報の報告は10分に1回まで送信できます」または「本日のお問い合わせ・商品情報の報告の送信上限（10件）に達しました」と表示します。

トリガーはデータ登録後に非同期で実行されるため、メール送信の一時的な失敗が利用者の問い合わせ登録を失敗させることはありません。失敗時は Edge Function Logs と `net._http_response` を確認してください。
