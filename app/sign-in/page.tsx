'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';

type Mode = 'signin' | 'signup';

export default function SignInPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmPending, setConfirmPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setLoading(true);
    setError('');

    const supabase = createClient();

    if (mode === 'signup') {
      const { data, error: err } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });
      setLoading(false);
      if (err) { setError(err.message); return; }
      if (data.session) {
        // Email confirmation disabled — signed in immediately
        router.push('/');
      } else {
        setConfirmPending(true);
      }
    } else {
      const { error: err } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      setLoading(false);
      if (err) { setError(err.message); return; }
      router.push('/');
    }
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError('');
  }

  if (confirmPending) {
    return (
      <main className="min-h-dvh bg-paper flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-xs space-y-6 text-center">
          <h1 className="font-serif text-3xl font-semibold text-ink tracking-tight">Check your email</h1>
          <p className="font-sans text-sm text-ink-2 leading-relaxed">
            We sent a confirmation link to{' '}
            <span className="font-medium text-ink">{email}</span>.
            Click it to activate your account.
          </p>
          <p className="font-sans text-xs text-ink-2 leading-relaxed opacity-70">
            Tip: disable email confirmation in Supabase for local dev
            (Authentication → Providers → Email → turn off "Confirm email").
          </p>
          <button
            onClick={() => { setConfirmPending(false); setMode('signin'); }}
            className="font-sans text-xs text-ink-2 underline underline-offset-2 hover:text-ink transition-colors"
          >
            Back to sign in
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-paper flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-xs space-y-10">

        {/* Brand */}
        <div className="text-center space-y-2">
          <h1 className="font-serif text-4xl font-semibold text-ink tracking-tight">MLO Study</h1>
          <p className="font-sans text-sm text-ink-2 leading-relaxed">
            NMLS exam prep.<br />Your progress syncs across all devices.
          </p>
        </div>

        <div className="border-t border-rule" />

        {/* Mode toggle */}
        <div className="flex rounded-md border border-rule overflow-hidden">
          {(['signin', 'signup'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => switchMode(m)}
              className={`flex-1 py-2 font-sans text-xs font-medium transition-colors duration-150 ${
                mode === m
                  ? 'bg-accent text-card'
                  : 'bg-card text-ink-2 hover:text-ink'
              }`}
            >
              {m === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          ))}
        </div>

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
              className="w-full px-3.5 py-2.5 rounded-md border border-rule bg-card text-ink font-sans text-sm placeholder:text-ink-2/50 focus:outline-none focus:border-ink-2 transition-colors duration-150"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="block font-sans text-xs font-medium text-ink-2 tracking-wide uppercase">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              required
              minLength={mode === 'signup' ? 8 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'signup' ? 'At least 8 characters' : '••••••••'}
              className="w-full px-3.5 py-2.5 rounded-md border border-rule bg-card text-ink font-sans text-sm placeholder:text-ink-2/50 focus:outline-none focus:border-ink-2 transition-colors duration-150"
            />
          </div>

          {error && (
            <p className="font-sans text-sm text-accent leading-snug">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-md bg-accent text-card font-sans text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity duration-150 active:scale-[0.99]"
          >
            {loading
              ? (mode === 'signin' ? 'Signing in…' : 'Creating account…')
              : (mode === 'signin' ? 'Sign In' : 'Create Account')}
          </button>
        </form>

        <p className="text-center font-sans text-xs text-ink-2 opacity-60">
          {mode === 'signin'
            ? "Don't have an account? "
            : 'Already have an account? '}
          <button
            type="button"
            onClick={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}
            className="underline underline-offset-2 hover:text-ink transition-colors"
          >
            {mode === 'signin' ? 'Create one' : 'Sign in'}
          </button>
        </p>
      </div>
    </main>
  );
}
