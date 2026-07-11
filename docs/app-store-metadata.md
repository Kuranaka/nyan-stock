# App Store Metadata Draft

App Store Connectに入力するための草案です。公開URL、価格、連絡先、法人/個人名は提出前に最終値へ差し替えてください。

## App Information

- App name: `にゃんストック`
- Subtitle: `猫用品の在庫と買い忘れ防止`
- Bundle ID: `com.nyanstock.app`
- SKU: `nyan-stock-ios`
- Primary category: `Lifestyle`
- Secondary category candidate: `Productivity`
- Age rating: 4+ 想定
- Medical: No
- Gambling / contests / unrestricted web access: No
- User-generated content: No public UGC

## Promotional Text

フード、猫砂、おやつなど、いつもの猫用品を切らす前に。にゃんストックは、猫ごとの在庫、残り日数、購入履歴、商品リンクをまとめて記録できる在庫管理アプリです。

## Description

にゃんストックは、猫用品の在庫と買い忘れを管理するためのアプリです。

フード、猫砂、おやつ、ケア用品などを登録すると、残量と1日あたりの使用量から残り日数を表示できます。購入リンクを登録しておけば、次に買うときも迷わずいつもの商品ページを開けます。

主な機能:

- 猫ごとの用品在庫管理
- 残り日数と在庫ステータスの表示
- 在庫切れ前のローカル通知
- 購入リンクの登録と再オープン
- 購入履歴の記録
- 月別費用レポート
- 家族共有と複数端末同期
- 無料プラン: 猫2匹、在庫10件まで
- Plus: 猫と在庫の登録数無制限、広告非表示

家族共有、購入履歴、月別費用レポート、複数端末同期は無料プランでも利用できます。Plusは、よく使う家庭向けに登録数の上限解除と広告非表示を提供します。

商品リンクにはアフィリエイトリンクが含まれる場合があります。外部サイトでの価格、在庫、配送、返品、決済、個人情報の取扱いは各外部サイトの表示と規約をご確認ください。

## Keywords

猫,ねこ,キャットフード,猫砂,在庫管理,買い忘れ,ペット用品,多頭飼い,購入履歴,通知,家族共有

## Support / Legal URLs

- Support URL: `https://nyan-stock.example.com/#signup`
- Marketing URL: `https://nyan-stock.example.com/`
- Privacy Policy URL: `https://nyan-stock.example.com/privacy`
- Terms URL: `https://nyan-stock.example.com/terms`
- Affiliate Disclosure URL: `https://nyan-stock.example.com/affiliate`

## Review Notes

```text
にゃんストックは、猫用品の在庫、残り日数、購入履歴、商品リンクを記録するアプリです。
ログインなしでも基本機能を確認できます。GoogleまたはAppleログインを行うと、共有コードを使った家族・他アカウントとの在庫共有を利用できます。

Plusは広告非表示と、猫プロフィール・在庫登録数の上限解除を提供します。
無料プランでは猫プロフィール2匹、在庫10件まで登録できます。
家族共有、購入履歴、月別費用レポート、複数端末同期は無料プランでも利用できます。
アプリ内に購入復元導線があります。購入画面から復元できます。

商品リンクにはアフィリエイトリンクが含まれる場合があります。外部ECサイトでの商品購入は各サイト上で行われます。
```

## Screenshots To Prepare

- Home: 猫ごとの在庫一覧と残り日数
- Inventory detail: 補充、購入リンク、アフィリエイト表示
- Add inventory: 商品登録フォーム
- Cat profile: 多頭飼いプロフィール
- Purchase history / monthly cost report
- Settings: 通知、共有、Plus、法務
- Plus screen: 価格、購入、復元、管理導線

Recommended sizes:

- iPhone 6.7 inch
- iPhone 6.5 inch
- iPhone 5.5 inch if App Store Connect requests it

## RevenueCat / IAP IDs

- Entitlement: `nyanstock_plus`
- Offering: `default`
- Monthly product: `nyan_stock_plus_monthly` / 300円
- Annual product: `nyan_stock_plus_annual` / 3,000円
- Env key: `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`

## Privacy Nutrition Label Inventory

Data handled by the app:

- Cat names, profile details, icons, memos
- Inventory item names, categories, amounts, usage estimates, purchase links, memos
- Purchase history and prices entered by the user
- Notification settings and local reminder schedule
- Supabase auth identifiers, email address or provider profile when login is used
- Household/share identifiers and synced inventory data when sharing is used
- RevenueCat purchase status, product identifiers, anonymous subscriber identifier
- Advertising-related data if the ad SDK is enabled

Suggested label direction before legal review:

- Contact Info: email address, only when login or signup captures it
- User Content: cat profiles, inventory, purchase history, links, memos
- Identifiers: user ID / anonymous ID / RevenueCat subscriber ID
- Purchases: subscription status through RevenueCat
- Diagnostics: only if crash/analytics tooling is added
- Location: not collected
- Health and Fitness: not collected for medical purposes
- Tracking: avoid if not using IDFA or cross-app tracking ads

ATT note:

初回リリースでIDFAや他社アプリ/サイトを横断するトラッキング広告を使わない場合、ATTプロンプトは不要に寄せる。AdMob設定とApp Store Privacy回答は提出前に一致させる。
