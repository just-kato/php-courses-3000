'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setLoading(true);
    setError('');

    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (err) { setError(err.message); return; }
    router.push('/');
  }

  return (
    <main className="min-h-dvh bg-paper flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-xs space-y-10">

        <div className="text-center space-y-2">
          <h1 className="font-serif text-4xl font-medium text-ink">MLO Study</h1>
          <p className="font-sans text-[14px] text-ink-2 leading-relaxed">
            NMLS exam prep.<br />Your progress syncs across all devices.
          </p>
        </div>

        <div className="border-t border-rule" />

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="email" className="block font-sans text-[12px] font-medium text-ink-2">
              Email address
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-3.5 py-2.5 rounded-md border border-rule bg-card text-ink font-sans text-[14px] placeholder:text-ink-2/50 focus:outline-none focus:border-accent transition-colors"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="block font-sans text-[12px] font-medium text-ink-2">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3.5 py-2.5 rounded-md border border-rule bg-card text-ink font-sans text-[14px] placeholder:text-ink-2/50 focus:outline-none focus:border-accent transition-colors"
            />
          </div>

          {error && (
            <p className="font-sans text-[14px] text-accent leading-snug">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-md bg-accent text-card font-sans text-[14px] font-medium hover:opacity-90 disabled:opacity-50 transition-opacity active:scale-[0.99]"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </main>
  );
}
