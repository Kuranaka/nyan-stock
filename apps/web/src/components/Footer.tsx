import Link from 'next/link';
import { supportEmail } from '@/lib/site';

const links = [
  { href: '/privacy', label: 'プライバシーポリシー' },
  { href: '/terms', label: '利用規約' },
  { href: '/affiliate', label: 'アフィリエイトについて' },
  { href: '/support', label: 'お問い合わせ' }
];

export function Footer() {
  return (
    <footer className="border-t border-line bg-white px-4 py-10 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-lg font-black text-ink">にゃんストック</p>
            <span className="rounded-full bg-honey px-2.5 py-1 text-[10px] font-black text-caramel">Version 2.0</span>
          </div>
          <p className="mt-1 text-sm text-muted">補充から買い時を学ぶ、ペット用品管理アプリ</p>
          {supportEmail ? <p className="mt-2 text-sm text-muted">お問い合わせ: {supportEmail}</p> : null}
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-3 text-sm font-semibold text-muted">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-ink">
              {link.label}
            </Link>
          ))}
        </div>
        <p className="text-sm text-muted">Copyright 2026 にゃんストック</p>
      </div>
    </footer>
  );
}
