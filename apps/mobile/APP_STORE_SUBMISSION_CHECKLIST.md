# App Store 提出チェックリスト

このファイルは、App Store Connect に提出する直前に確認する運用チェックリストです。
実際のストア情報、SDK設定、バックエンドの公開状態はソースコードだけでは完了しません。

## 正本

- リリース概要: [RELEASE_2.0.0.md](./RELEASE_2.0.0.md)
- Simulator / TestFlightの動作確認とGo / No-Go:
  [SMOKE_TEST_2.0.0.md](./SMOKE_TEST_2.0.0.md)
- ストア文面とReview Notes:
  [app-store-metadata.md](../../docs/app-store-metadata.md)
- App Privacy申告:
  [privacy-disclosure-2.0.md](../../docs/privacy-disclosure-2.0.md)

このファイルには、外部サービスの公開設定とApp Store Connectへの入力だけを記録します。
コード上の完了や手動テスト結果は、上記の正本と重複してチェックしません。

## 提出前に必ず完了すること

### ビルドとバックエンド

- [ ] EAS上の現在のiOSビルド番号を確認し、既存のApp Store Connectビルドより大きいTestFlight候補を作成する。
      2026年7月26日の確認値は`20`。次の候補はauto increment後の`21`以上にする。
- [ ] EAS production環境のSupabase URL / anon key / 認証redirectが提出先プロジェクトの値であり、
      `RELEASE_SUPABASE_PROJECT_REF`が本番URLのプロジェクト識別子と一致することを確認する。
      公開ビルドでは`implicit`認証を使わず、PKCEを使う。
      2026年7月26日のEAS設定読み取りでは`RELEASE_SUPABASE_PROJECT_REF`が未登録のため、
      store build作成前に追加が必要。
- [ ] Web の `NEXT_PUBLIC_SITE_URL` と `NEXT_PUBLIC_SUPPORT_EMAIL` を実在する本番値に設定し、`/privacy` がログイン不要で表示されることを確認する。
      2026年7月26日時点の公開`/terms`は「猫用品」表記と旧施行日のままのため、
      `apps/web`の最新版をデプロイし、公開URLを再確認するまで提出しない。
- [ ] 本番の`/privacy`とアプリ内ポリシーに、データ別の保持基準、削除後のバックアップ・ログ、委託先の保護・監督、Resend、旧版の商品マスタ改善用データ、検索語・商品URLの識別可能性が同じ内容で掲載されていることを確認する。
- [ ] Supabaseへ`20260726000004_disable_mobile_product_master_suggestions.sql`を適用し、旧版を含むモバイルクライアントから商品マスタ改善用データを送信できないことを確認する。
- [ ] 旧版から過去に送信済みの商品マスタ改善用データについて、本番での保持状況とアカウント削除・削除依頼時の削除を確認する。
- [ ] `delete-account`と`cleanup-unused-icons`の最新版を提出先Supabaseへデプロイする。
- [ ] `delete-account`をデプロイするSupabaseプロジェクトに`SUPABASE_URL`、
      `SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`が設定されていることを確認する。
      サービスロールキーはアプリへ入れない。

### 認証・課金・広告

- [ ] SupabaseのApple・Googleログイン、Anonymous sign-ins、Enable Manual Linking、
      `nyanstock://auth/callback`を本番プロジェクトで有効にする。
- [ ] ゲストからApple / Googleへ切り替えたときに同じユーザーIDと共有参加状態が保たれ、
      既存アカウントとの衝突時にはゲストデータが変更されないことを実機で確認する。
- [ ] Sign in with Appleのトークン自動失効は未実装。Appleの最新要件を確認し、必要な場合は
      authorization code / refresh tokenをサーバーで安全に扱う失効処理を実装する。現行版では
      データ削除を止めず、削除後にiOS設定から「Appleでサインイン」の使用を停止する手順を画面に表示する。
- [ ] `apps/mobile/app.json` と生成済み iOS の `GADApplicationIdentifier` が同じ本番iOS AdMob App IDであることを確認する。GoogleのサンプルApp IDが残っているのはAndroid側だけなので、iOS提出とは切り分ける。実在する本番バナーIDを `EXPO_PUBLIC_ADMOB_BANNER_UNIT_ID` に設定して実機確認するまで、広告を有効にして提出しない。
- [ ] RevenueCat の iOS 公開 SDK キー、Current Offering、Apple の月額・年額サブスクリプション商品、`nyanstock_plus` entitlement を本番環境で接続し、購入・復元・管理導線を Sandbox で確認する。未設定なら Plus の訴求・購入画面を提出ビルドから外す。
- [ ] Plus購入画面に表示される期間・価格がApp Store Connectの登録値と一致することを確認する。アプリはproduct IDと価格を固定せず、RevenueCatのCurrent Offeringから取得する。
- [ ] UMPメッセージとATTの表示条件、同意状況ごとの広告リクエスト、Plusでの広告非表示を本番AdMob設定で確定する。
- [ ] `delayAppMeasurementInit: true`と生成済みiOSの`GADDelayAppMeasurementInit=true`を維持し、
      Plus判定・UMP・ATTより前にGoogle Mobile Adsのapp measurementが始まらないことを実機通信で確認する。
- [ ] 【公開ブロッカー】Google Mobile Adsが実際に追跡へ使う全ドメインを確認し、iOS Privacy Manifestの`NSPrivacyTracking`と`NSPrivacyTrackingDomains`を現行のATT実装に一致させる。ドメイン未確定の状態では提出しない。
      EASのstore buildは、この2項目が確定するまで`validate-release-env.mjs`で自動停止する。

### App Store Connect

- [ ] Privacy Policy URLに本番の`/privacy`、Support URLとMarketing URLに公開URLを設定する。
- [ ] App Privacyを[privacy-disclosure-2.0.md](../../docs/privacy-disclosure-2.0.md)の申告表どおりに更新する。
- [ ] App Privacyの検索履歴・閲覧履歴を、認証リクエストや運用ログとの紐付け可能性を考慮して「ユーザーに紐付く」と申告する。
- [ ] [app-store-metadata.md](../../docs/app-store-metadata.md)を正本として、名前、サブタイトル、
      説明文、キーワード、プロモーションテキスト、カテゴリを入力する。
- [ ] すべての URL、問い合わせ先、課金価格、スクリーンショット、説明文に仮表記や「予定」が残っていないことを確認する。
- [ ] iPhone 6.9 inchとiPad 13 inch（`supportsTablet: true`）のスクリーンショットを用意し、提出時点のApple公式仕様で寸法を再確認する。
- [ ] 月額商品と年額商品の審査用スクリーンショットを、それぞれのサブスクリプション商品へ登録する。
- [ ] Export Compliance、コンテンツ権利、広告識別子、年齢区分、審査連絡先の回答を現行実装に合わせる。
- [ ] App Review Notesへ正本の文面を転記し、必要な共有コードまたは確認用アカウントを安全に追記する。
- [ ] TestFlightのフィードバック、クラッシュ、起動指標を確認し、
      [SMOKE_TEST_2.0.0.md](./SMOKE_TEST_2.0.0.md)のGo判定後に審査へ提出する。

## App Review Notes

提出文面は [app-store-metadata.md](../../docs/app-store-metadata.md) の「Review Notes」を正本とします。共有スペースの作成にはGoogleまたはAppleログインが必要ですが、ゲストでも発行済みの共有コードで参加できます。App Store Connectへ転記する際は、必要な共有コードまたは確認用アカウントを追記します。
