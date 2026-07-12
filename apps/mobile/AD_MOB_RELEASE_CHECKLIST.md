# AdMob リリース確認

現行方針は **パーソナライズ広告を許可した利用者にのみパーソナライズ広告を配信する** です。iOS では UMP による同意後に ATT を表示し、ATT が許可されない場合は非パーソナライズ広告へフォールバックします。

## 本番ビルド前

- AdMob の「Privacy & messaging」で、配信地域に必要な UMP メッセージを公開する。EEA/英国/スイスおよび規制対象の米国州で、初回表示と「Privacy options（プライバシー設定）」再表示を実機で確認する。
- `app.json` と生成済みの `ios/app/Info.plist`、`android/app/src/main/AndroidManifest.xml` の AdMob アプリ ID が対象プラットフォームの本番 ID であることを確認する。テスト値のままでは公開しない。
- EAS production 環境に `EXPO_PUBLIC_ADMOB_BANNER_UNIT_ID`（本番バナー広告ユニット ID）を設定する。開発・プレビューにはテスト広告ユニットだけを使う。
- AdMob の「Privacy & messaging」で European regulations と、対象となる場合は US state regulations の UMP メッセージを公開する。iOS でパーソナライズ広告を行うため、IDFA explainer も作成・公開する。
- `NSUserTrackingUsageDescription` と ATT の事前同意フローを維持する。ATT、UMP、または地域で必要な同意が拒否・未完了なら非パーソナライズ広告にフォールバックすること。
- App Store Connect の「App Privacy」では、実際に収集・リンクされる広告 SDK のデータを確認し、広告用途の該当データを `Tracking` として申告する。Google Mobile Ads SDK の最新のデータ開示内容と AdMob コンソールの配信設定に照らして回答する。
- Google Play の Data safety でも、Google Mobile Ads SDK の実際のデータ処理と同意メッセージを反映する。

## 実機確認

- 初回広告リクエストより前に UMP の同意フローと iOS の ATT が完了すること。
- 「設定 > 広告のプライバシー設定」から UMP の選択画面を再表示できること。
- UMP の同意未完了・同意 SDK エラー時は広告を読み込まないこと。ATT が拒否・制限された場合は `requestNonPersonalizedAdsOnly: true` で広告を読み込むこと。
- ATT と UMP の両方を許可した iOS 実機ではパーソナライズ広告を要求でき、広告リクエストにアプリ独自のキーワード、PPID、カスタムターゲティングを付与していないこと。
