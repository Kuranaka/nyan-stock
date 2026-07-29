# App Store Metadata Draft

App Store Connectに入力するための草案です。公開URL、価格、連絡先、法人/個人名は提出前に最終値へ差し替えてください。

## App Information

- App name: `にゃんストック`
- Subtitle: `ペット用品の在庫と買い忘れ防止`
- Bundle ID: `com.nyanstock.app`
- SKU: `nyan-stock-ios`
- Primary category: `Lifestyle`
- Secondary category candidate: `Productivity`
- Age rating: 4+ 想定
- Medical: No
- Gambling / contests / unrestricted web access: No
- User-generated content: No public UGC

## Promotional Text

フード、トイレ用品、おやつなど、いつものペット用品を切らす前に。にゃんストックは、ペットごとの在庫、残り日数、購入履歴、商品リンクをまとめて記録できる在庫管理アプリです。

## Description

にゃんストックは、ペット用品の在庫と買い忘れを管理するためのアプリです。

フード、トイレ用品、おやつ、ケア用品などを登録すると、残量と1日あたりの使用量から残り日数を表示できます。購入リンクを登録しておけば、次に買うときも迷わずいつもの商品ページを開けます。

主な機能:

- ペットごとの用品在庫管理
- 残り日数と在庫ステータスの表示
- 在庫切れ前のローカル通知
- 購入リンクの登録と再オープン
- 購入履歴の記録
- 費用ダッシュボードと月別購入履歴
- 家族共有と複数端末同期
- 無料プラン: ペット2匹、在庫10件まで
- Plus: ペットと在庫の登録数無制限、広告非表示

家族共有、購入履歴、費用ダッシュボード、複数端末同期は無料プランでも利用できます。Plusは、よく使う家庭向けに登録数の上限解除と広告非表示を提供します。

にゃんストック Plusは自動更新型サブスクリプションです。

月額・年額プランの期間と価格は、購入時にApp Storeへ表示される内容をご確認ください。

商品リンクにはアフィリエイトリンクが含まれる場合があります。外部サイトでの価格、在庫、配送、返品、決済、個人情報の取扱いは各外部サイトの表示と規約をご確認ください。

プライバシーポリシー: https://nyanstock.com/privacy

利用規約: https://nyanstock.com/terms

## Keywords

ペット,犬,猫,フード,トイレ用品,在庫管理,買い忘れ,ペット用品,多頭飼い,購入履歴,通知,家族共有

## Support / Legal URLs

- Support URL: `https://nyanstock.com/support`
- Marketing URL: `https://nyanstock.com/`
- Privacy Policy URL: `https://nyanstock.com/privacy`
- Terms URL: `https://nyanstock.com/terms`
- Affiliate Disclosure URL: `https://nyanstock.com/affiliate`

## Review Notes

```text
にゃんストックは、ペット用品の在庫、残り日数、購入履歴、商品リンクを記録するアプリです。
メールアドレスの入力なしで匿名ゲストとして開始できます。開始時にSupabaseの匿名ユーザーIDが作成されます。
共有スペースの作成にはGoogleまたはAppleログインが必要です。ゲストでも、発行済みの共有コードを使って共有スペースへ参加できます。

Plusは広告非表示と、ペットプロフィール・在庫登録数の上限解除を提供します。
無料プランではペットプロフィール2匹、在庫10件まで登録できます。
家族共有、購入履歴、費用ダッシュボード、複数端末同期は無料プランでも利用できます。
アプリ内に購入復元導線があります。購入画面から復元できます。
アカウント削除は「設定 > データ管理 > アカウントを削除」から実行できます。

商品リンクにはアフィリエイトリンクが含まれる場合があります。外部ECサイトでの商品購入は各サイト上で行われます。
```

## Screenshots To Prepare

- Inventory: ペットごとの在庫一覧と残り日数
- Inventory detail: 補充、購入リンク、アフィリエイト表示
- Add inventory: 商品登録フォーム
- Pet profile: 複数ペットのプロフィール
- Cost dashboard / purchase history
- Settings: 通知、共有、Plus、法務
- Plus screen: 価格、購入、復元、管理導線

提出対象:

- iPhone 6.9 inch
- iPad 13 inch（`supportsTablet: true`のため必須）

6.9 inchのiPhone画像を用意しない場合は6.5 inchが必須です。正確なピクセル寸法は、提出時点の[Apple公式スクリーンショット仕様](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/)を確認します。

## RevenueCat / IAP IDs

- Entitlement: `nyanstock_plus`
- Offering: RevenueCatのCurrent Offering（identifierはアプリに固定していない）
- Monthly / Annual product: Current Offeringの月額・年額package（product IDはアプリに固定していない）
- Price: App Storeから取得した価格をアプリ内に表示
- Env key: `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`

App Store ConnectとRevenueCatに登録するproduct ID、期間、価格は、提出前に両サービスの実値を確認して記録します。

## Privacy Nutrition Label Inventory

App Store ConnectのApp Privacy回答は、現行実装と第三者SDKを含めて整理した `docs/privacy-disclosure-2.0.md` を正本とします。

特に、ゲスト開始時にもSupabaseの匿名ユーザーIDを作成すること、RevenueCatが購入情報を処理すること、Google AdMob / UMPが広告・操作・診断情報を処理する場合があることを省略しません。現行構成ではデバイスIDを「トラッキングに使用」と回答し、Privacy Manifestの追跡ドメイン確認を完了してから提出します。
