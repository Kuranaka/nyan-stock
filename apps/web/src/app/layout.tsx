import type { Metadata } from 'next';
import { siteUrl } from '@/lib/site';
import './globals.css';

const title = 'にゃんストック Version 2.0｜ペット用品の在庫・買い時を管理';
const description =
  '猫・犬・うさぎ・小動物・鳥・観賞魚・爬虫類／両生類・昆虫の8区分に対応。補充履歴から次の買い時を学習し、残り日数の通知、費用の見える化、家族との共有で買い忘れを防ぐ在庫管理アプリです。';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl ?? 'http://localhost:3000'),
  applicationName: 'にゃんストック',
  title,
  description,
  icons: {
    icon: '/app-icon.png',
    apple: '/apple-touch-icon.png'
  },
  openGraph: {
    title,
    description,
    type: 'website',
    locale: 'ja_JP',
    siteName: 'にゃんストック',
    ...(siteUrl ? { url: siteUrl } : {}),
    images: [{ url: '/og-image.png', width: 1200, height: 630 }]
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: ['/og-image.png']
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
