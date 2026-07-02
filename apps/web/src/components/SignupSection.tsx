'use client';

import { FormEvent, useState } from 'react';
import { trackEvent } from '@/lib/analytics';
import { isValidEmail, submitSignup } from '@/lib/signup';

const catOptions = ['1匹', '2匹', '3匹以上', 'まだ飼っていない'];
const priorityOptions = ['フード', '猫砂', 'おやつ', 'サプリ・薬', 'すべて'];

export function SignupSection() {
  const [email, setEmail] = useState('');
  const [cats, setCats] = useState(catOptions[0]);
  const [priority, setPriority] = useState(priorityOptions[0]);
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');

    if (!email.trim()) {
      setMessage('メールアドレスを入力してください。');
      return;
    }

    if (!isValidEmail(email)) {
      setMessage('メールアドレスの形式を確認してください。');
      return;
    }

    setIsSubmitting(true);
    await submitSignup({ email, cats, priority });
    trackEvent('signup_submit', { source: 'lp', cats, priority });
    setIsSubmitting(false);
    setEmail('');
    setMessage('登録ありがとうございます。リリース時にお知らせします。');
  }

  return (
    <section id="signup" className="px-4 py-16 sm:px-6">
      <div className="mx-auto grid max-w-6xl gap-8 rounded-[32px] border border-line bg-ink p-6 text-white shadow-soft sm:p-10 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <p className="text-sm font-bold text-honey">事前登録</p>
          <h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">リリース時にお知らせします</h2>
          <p className="mt-4 leading-7 text-white/75">
            にゃんストックは現在開発中です。リリース時のお知らせを受け取りたい方は、メールアドレスを登録してください。
          </p>
        </div>
        <form onSubmit={onSubmit} className="rounded-[28px] bg-white p-5 text-ink sm:p-6">
          <label className="block text-sm font-bold" htmlFor="email">
            メールアドレス
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-line px-4 py-3 outline-none focus:border-caramel"
            placeholder="name@example.com"
          />
          <label className="mt-5 block text-sm font-bold" htmlFor="cats">
            猫の飼育数
          </label>
          <select
            id="cats"
            value={cats}
            onChange={(event) => setCats(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-line bg-white px-4 py-3 outline-none focus:border-caramel"
          >
            {catOptions.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
          <label className="mt-5 block text-sm font-bold" htmlFor="priority">
            一番管理したいもの
          </label>
          <select
            id="priority"
            value={priority}
            onChange={(event) => setPriority(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-line bg-white px-4 py-3 outline-none focus:border-caramel"
          >
            {priorityOptions.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-6 w-full rounded-full bg-caramel px-6 py-4 font-bold text-white transition hover:bg-ink disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? '送信中...' : '送信する'}
          </button>
          {message ? <p className="mt-4 rounded-2xl bg-honey px-4 py-3 text-sm font-bold text-ink">{message}</p> : null}
        </form>
      </div>
    </section>
  );
}
