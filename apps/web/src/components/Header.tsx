'use client';

import Link from 'next/link';
import { trackEvent } from '@/lib/analytics';

const navItems = [
  { href: '#features', label: '特徴' },
  { href: '#how-to-use', label: '使い方' },
  { href: '#signup', label: '事前登録' },
  { href: '#faq', label: 'FAQ' }
];

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-cream/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-3 font-bold text-ink" aria-label="にゃんストック ホーム">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-honey text-xl">猫</span>
          <span>にゃんストック</span>
        </Link>
        <nav className="hidden items-center gap-6 text-sm font-semibold text-muted md:flex">
          {navItems.map((item) => (
            <a key={item.href} href={item.href} className="transition hover:text-ink">
              {item.label}
            </a>
          ))}
        </nav>
        <a
          href="#signup"
          onClick={() => trackEvent('cta_click', { source: 'header' })}
          className="rounded-full bg-ink px-4 py-2 text-sm font-bold text-white transition hover:bg-caramel"
        >
          通知を受け取る
        </a>
      </div>
    </header>
  );
}
