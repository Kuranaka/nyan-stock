'use client';

import Image from 'next/image';
import Link from 'next/link';

const navItems = [
  { href: '#features', label: '特徴' },
  { href: '#how-to-use', label: '使い方' },
  { href: '#faq', label: 'FAQ' }
];

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-cream/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-3 font-bold text-ink" aria-label="にゃんストック ホーム">
          <Image
            src="/app-icon.png"
            alt=""
            width={40}
            height={40}
            className="h-10 w-10 rounded-xl"
            priority
          />
          <span>にゃんストック</span>
        </Link>
        <nav className="hidden items-center gap-6 text-sm font-semibold text-muted md:flex">
          {navItems.map((item) => (
            <a key={item.href} href={item.href} className="transition hover:text-ink">
              {item.label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}
