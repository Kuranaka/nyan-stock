import type { Metadata } from 'next';
import { siteUrl } from '@/lib/site';
import './globals.css';

const description =
  'にゃんストックは、フード・トイレ用品・おやつなどペット用品の残り日数を管理し、なくなる前にお知らせする在庫管理アプリです。';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl ?? 'http://localhost:3000'),
  title: 'にゃんストック｜ペット用品の買い忘れを防ぐ在庫管理アプリ',
  description,
  icons: {
    icon: '/app-icon.png',
    apple: '/apple-touch-icon.png'
  },
  openGraph: {
    title: 'にゃんストック｜ペット用品の買い忘れを防ぐ在庫管理アプリ',
    description,
    type: 'website',
    ...(siteUrl ? { url: siteUrl } : {}),
    images: [{ url: '/og-image.png', width: 1200, height: 630 }]
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
