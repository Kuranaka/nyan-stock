import type { Metadata } from 'next';
import { siteUrl } from '@/lib/site';
import './globals.css';

const description =
  'にゃんストックは、フード・猫砂・おやつなど猫用品の残り日数を管理し、なくなる前にお知らせする猫向け在庫管理アプリです。';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl ?? 'http://localhost:3000'),
  title: 'にゃんストック｜猫用品の買い忘れを防ぐ在庫管理アプリ',
  description,
  openGraph: {
    title: 'にゃんストック｜猫用品の買い忘れを防ぐ在庫管理アプリ',
    description,
    type: 'website',
    ...(siteUrl ? { url: siteUrl } : {}),
    images: [{ url: '/og-image.svg', width: 1200, height: 630 }]
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
