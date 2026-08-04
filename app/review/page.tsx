'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import { BottomNav } from '@/components/BottomNav';
import * as db from '@/lib/db';
import { scheduleCard, filterDue, shuffle } from '@/lib/srs';
import type { Flashcard } from '@/lib/db-types';

export default function ReviewPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [queue, setQueue] = useState<Flashcard[]>([]);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [sessionTotal, setSessionTotal] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/sign-in'); return; }
      const all = await db.getAllFlashcards(supabase, user.id);
      const due = shuffle(filterDue(all));
      setQueue(due);
      setLoading(false);
    });
  }, [supabase, router]);

  async function handleAnswer(correct: boolean) {
    const card = queue[idx];
    if (!card) return;

    const updates = scheduleCard(card, correct);
    await db.updateFlashcardSRS(supabase, card.id, {
      ease: updates.ease,
      interval_days: updates.interval_days,
      due_at: updates.due_at.toISOString(),
      lapses: updates.lapses,
    });

    if (correct) setSessionCorrect((n) => n + 1);
    setSessionTotal((n) => n + 1);

    const next = idx + 1;
    if (next >= queue.length) {
      setDone(true);
    } else {
      setIdx(next);
      setFlipped(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-dvh bg-paper pb-28">
        <div className="max-w-lg mx-auto px-5 py-20 space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded bg-rule opacity-40" />
          ))}
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-paper pb-28">
      <header className="bg-card border-b border-rule px-5 py-3.5">
        <h1 className="font-serif text-lg font-medium text-ink">Review</h1>
        <p className="font-sans text-[12px] text-ink-2 mt-0.5">
          {done || queue.length === 0
            ? sessionTotal > 0 ? `${sessionCorrect}/${sessionTotal} correct this session` : 'All caught up'
            : `${queue.length} cards due · ${idx + 1} of ${queue.length}`}
        </p>
      </header>

      <div className="max-w-lg mx-auto px-5 py-8">
        {queue.length === 0 && !loading ? (
          <div className="rounded-md border border-rule bg-card p-8 text-center space-y-4">
            <p className="font-serif text-2xl font-medium text-ink">All caught up</p>
            <p className="font-sans text-[15px] text-ink-2 leading-relaxed">
              No cards are due right now. Come back tomorrow to keep your streak going.
            </p>
            <Link
              href="/"
              className="inline-block mt-2 px-5 py-2.5 rounded-md border border-rule font-sans text-[14px] font-medium text-ink-2 hover:border-ink-2 hover:text-ink transition-colors"
            >
              Back to home
            </Link>
          </div>
        ) : done ? (
          <div className="rounded-md border border-rule bg-card p-8 text-center space-y-4">
            <p className="font-serif text-2xl font-medium text-ink">Session complete</p>
            <div className="flex items-center justify-center gap-6 py-2">
              <div>
                <p className="font-sans tabular-nums text-3xl font-medium text-ink">{sessionCorrect}</p>
                <p className="font-sans text-[12px] text-sage mt-1">Correct</p>
              </div>
              <div className="w-px h-10 bg-rule" />
              <div>
                <p className="font-sans tabular-nums text-3xl font-medium text-ink">{sessionTotal - sessionCorrect}</p>
                <p className="font-sans text-[12px] text-ink-2 mt-1">Again</p>
              </div>
              <div className="w-px h-10 bg-rule" />
              <div>
                <p className="font-sans tabular-nums text-3xl font-medium text-ink">
                  {Math.round((sessionCorrect / sessionTotal) * 100)}%
                </p>
                <p className="font-sans text-[12px] text-ink-2 mt-1">Accuracy</p>
              </div>
            </div>
            <div className="space-y-2 pt-2">
              <Link
                href="/"
                className="block w-full py-2.5 rounded-md bg-accent text-card font-sans text-[14px] font-medium text-center hover:opacity-90 transition-opacity"
              >
                Done
              </Link>
              <Link
                href="/ingest"
                className="block w-full py-2.5 rounded-md border border-rule font-sans text-[14px] font-medium text-ink-2 text-center hover:border-ink-2 hover:text-ink transition-colors"
              >
                Add more content
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="h-1 rounded-sm bg-rule overflow-hidden">
              <div
                className="h-full bg-accent transition-all duration-300"
                style={{ width: `${(idx / queue.length) * 100}%` }}
              />
            </div>

            <button
              onClick={() => setFlipped((f) => !f)}
              className="w-full min-h-52 rounded-md border border-rule bg-card p-8 text-left cursor-pointer hover:bg-paper transition-colors"
            >
              <p className="font-sans text-[11px] font-medium text-ink-2 uppercase tracking-wide mb-4">
                {flipped ? 'Answer' : 'Description'}
              </p>
              <p className="font-serif text-ink text-lg leading-relaxed">
                {flipped ? queue[idx].back : queue[idx].front}
              </p>
              {!flipped && (
                <p className="font-sans text-[12px] text-ink-2/60 mt-6">Tap to reveal</p>
              )}
            </button>

            <div
              className={`flex gap-3 transition-all duration-150 ${flipped ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
            >
              <button
                onClick={() => handleAnswer(false)}
                className="flex-1 py-3 rounded-md border border-rule font-sans text-[14px] font-medium text-ink-2 hover:border-ink hover:text-ink transition-colors active:scale-[0.99]"
              >
                Again
              </button>
              <button
                onClick={() => handleAnswer(true)}
                className="flex-1 py-3 rounded-md bg-sage text-card font-sans text-[14px] font-medium hover:opacity-90 transition-opacity active:scale-[0.99]"
              >
                Got it
              </button>
            </div>

            {queue[idx].source_anchor && flipped && (
              <Link
                href={`/lessons/${(queue[idx] as Flashcard & { lesson_id: string }).lesson_id}?tab=source`}
                className="block font-sans text-[12px] text-ink-2 hover:text-accent italic transition-colors text-center"
              >
                "{queue[idx].source_anchor?.slice(0, 60)}…" →
              </Link>
            )}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
