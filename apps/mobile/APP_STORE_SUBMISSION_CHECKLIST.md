# App Store 提出チェックリスト

このファイルは、App Store Connect に提出する直前に確認する運用チェックリストです。
実際のストア情報、SDK設定、バックエンドの公開状態はソースコードだけでは完了しません。

## 提出前に必ず完了すること

- [ ] Web の `NEXT_PUBLIC_SITE_URL` と `NEXT_PUBLIC_SUPPORT_EMAIL` を実在する本番値に設定し、`/privacy` がログイン不要で表示されることを確認する。
- [ ] App Store Connect の Privacy Policy URL に本番の `/privacy` を設定する。
- [ ] App Store Connect の App Privacy で、アプリ本体だけでなく Supabase、RevenueCat、AdMob を含めた実際のデータ取扱いを申告する。
- [x] `supabase functions deploy delete-account` を実行し、Google、Apple、匿名ゲストの各ログインで「設定 > アカウントを削除」が完了することを実機で確認する。
- [x] `delete-account` をデプロイする Supabase プロジェクトに `SUPABASE_URL`、`SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY` が設定されていることを確認する。サービスロールキーをアプリへ入れない。
- [ ] `apps/mobile/app.json` と生成済み iOS の `GADApplicationIdentifier` にある Google のテスト用 AdMob App ID を、実際の本番 App ID に置き換える。実在する本番バナーIDを `EXPO_PUBLIC_ADMOB_BANNER_UNIT_ID` に設定して実機確認するまで、広告を有効にして提出しない。
- [ ] RevenueCat の iOS 公開 SDK キー、Current Offering、Apple の月額・年額サブスクリプション商品、`nyanstock_plus` entitlement を本番環境で接続し、購入・復元・管理導線を Sandbox で確認する。未設定なら Plus の訴求・購入画面を提出ビルドから外す。
- [ ] すべての URL、問い合わせ先、課金価格、スクリーンショット、説明文に仮表記や「予定」が残っていないことを確認する。
- [ ] 実機で初回起動、通知を拒否した状態、写真アクセスを拒否した状態、ログアウト、アカウント削除、外部購入リンク、Googleログイン、Appleログイン、購入復元を確認する。
- [ ] App Review Notes に、ログイン不要で在庫管理を試せること、共有機能の確認手順、課金機能の有無、アカウント削除の場所を具体的に記載する。

## App Review Notes のたたき台

```text
にゃんストックはペット用品の在庫管理アプリです。基本の在庫管理はログイン不要で確認できます。

共有・複数端末同期は「設定 > Googleでログイン」または「Appleでログイン」後に利用できます。
アカウント削除は「設定 > データ管理 > アカウントを削除」から実行できます。

（Plusを提出する場合）Plus は登録数上限の解除と広告非表示のための自動更新サブスクリプションです。購入復元は「にゃんストック Plus > 購入を復元」から確認できます。
```
