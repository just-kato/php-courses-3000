'use client';

import { useState } from 'react';
import { createClient } from '@/utils/supabase/client';

export default function SignInPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError('');
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setLoading(false);
    if (err) { setError(err.message); return; }
    setSent(true);
  }

  return (
    <main className="min-h-dvh bg-paper flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-xs space-y-10">

        {/* Brand */}
        <div className="text-center space-y-2">
          <h1 className="font-serif text-4xl font-semibold text-ink tracking-tight">
            MLO Study
          </h1>
          <p className="font-sans text-sm text-ink-2 leading-relaxed">
            NMLS exam prep.<br />Your progress syncs across all devices.
          </p>
        </div>

        {/* Divider */}
        <div className="border-t border-rule" />

        {sent ? (
          <div className="space-y-4 text-center">
            <p className="font-serif text-lg text-ink">Check your email</p>
            <p className="font-sans text-sm text-ink-2 leading-relaxed">
              We sent a sign-in link to{' '}
              <span className="font-medium text-ink">{email}</span>.
              Click it to continue — no password needed.
            </p>
            <button
              className="font-sans text-xs text-ink-2 underline underline-offset-2 hover:text-ink transition-colors"
              onClick={() => setSent(false)}
            >
              Use a different address
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="email" className="block font-sans text-xs font-medium text-ink-2 tracking-wide uppercase">
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
                className="w-full px-3.5 py-2.5 rounded-md border border-rule bg-card text-ink font-sans text-sm placeholder-ink-2/50 focus:outline-none focus:border-ink-2 transition-colors duration-150"
              />
            </div>

            {error && (
              <p className="font-sans text-sm text-accent">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-md bg-accent text-card font-sans text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity duration-150 active:scale-[0.99]"
            >
              {loading ? 'Sending…' : 'Send Magic Link'}
            </button>
          </form>
        )}

        <p className="text-center font-sans text-xs text-ink-2 opacity-60">
          No password. No account setup. Just your email.
        </p>
      </div>
    </main>
  );
}
