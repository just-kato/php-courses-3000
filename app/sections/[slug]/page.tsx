'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import { BottomNav } from '@/components/BottomNav';
import { CardSkeleton } from '@/components/Skeleton';
import * as db from '@/lib/db';
import { lessonStatus } from '@/lib/db-types';
import { filterDue } from '@/lib/srs';
import type { Section, Lesson, Flashcard } from '@/lib/db-types';

const STATUS_LABEL = {
  empty: 'No source',
  generating: 'Generating…',
  ready: 'Ready',
  completed: 'Completed',
} as const;

const STATUS_CLASS = {
  empty: 'text-ink-2 border-rule',
  generating: 'text-amber-600 border-amber-200 bg-amber-50',
  ready: 'text-accent border-accent/30 bg-accent/5',
  completed: 'text-sage border-sage/30 bg-sage/10',
} as const;

export default function SectionPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [section, setSection] = useState<Section | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [dueCounts, setDueCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/sign-in'); return; }

      const [sect, allLessons] = await Promise.all([
        db.getSectionBySlug(supabase, slug),
        db.getLessons(supabase, user.id),
      ]);

      if (!sect) { router.push('/'); return; }

      const sectionLessons = allLessons.filter((l) => l.section_id === sect.id);
      setSection(sect);
      setLessons(sectionLessons);

      // Load due card counts per lesson
      const cardsByLesson = await Promise.all(
        sectionLessons.map((l) => db.getFlashcards(supabase, l.id))
      );
      const counts: Record<string, number> = {};
      sectionLessons.forEach((l, i) => {
        counts[l.id] = filterDue(cardsByLesson[i] as Pick<Flashcard, 'due_at'>[]).length;
      });
      setDueCounts(counts);
      setLoading(false);
    });
  }, [supabase, router, slug]);

  async function handleRegenerate(lesson: Lesson) {
    if (!section) return;
    setRegenerating(lesson.id);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lessonId: lesson.id,
          title: lesson.title,
          sourceContent: lesson.source_content,
          questionMix: section.question_mix,
        }),
      });
      const json = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || json.error) throw new Error(json.error ?? 'Regeneration failed');
      // Reload lessons to reflect updated generated_at
      const { data } = await supabase
        .from('lessons')
        .select('*')
        .eq('section_id', section.id)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (data) setLessons(data as Lesson[]);
    } catch (err) {
      console.error('Regenerate failed', err);
    } finally {
      setRegenerating(null);
    }
  }

  const completedCount = lessons.filter((l) => l.completed_at).length;
  const readyCount = lessons.filter((l) => lessonStatus(l) === 'ready').length;

  return (
    <div className="min-h-dvh bg-paper pb-28">
      <header className="bg-card border-b border-rule px-5 py-3.5">
        <div className="flex items-start gap-3">
          <Link href="/" className="font-sans text-xs text-ink-2 hover:text-ink transition-colors mt-0.5">
            ← Home
          </Link>
        </div>
        {section ? (
          <div className="mt-2">
            <h1 className="font-serif text-lg font-semibold text-ink tracking-tight leading-snug">
              {section.name}
            </h1>
            <p className="font-sans text-xs text-ink-2 mt-0.5">
              {Math.round(section.exam_weight * 100)}% of exam ·{' '}
              {completedCount}/{lessons.length} complete
              {readyCount > 0 && ` · ${readyCount} ready to study`}
            </p>
          </div>
        ) : (
          <div className="mt-2 h-5 w-48 animate-pulse rounded bg-rule" />
        )}
      </header>

      <div className="max-w-lg mx-auto px-5 py-6 space-y-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)
        ) : lessons.length === 0 ? (
          <EmptyState sectionId={section?.id} />
        ) : (
          lessons.map((lesson) => {
            const status = lessonStatus(lesson);
            const due = dueCounts[lesson.id] ?? 0;
            const isRegenerating = regenerating === lesson.id;

            return (
              <div
                key={lesson.id}
                className="border border-rule rounded-md bg-card overflow-hidden"
              >
                <Link
                  href={`/lessons/${lesson.id}`}
                  className="flex items-start justify-between gap-4 px-4 py-3 hover:bg-paper transition-colors group"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-sans text-sm font-medium text-ink leading-snug group-hover:text-accent transition-colors">
                      {lesson.title}
                    </p>
                    {status !== 'empty' && (
                      <p className="font-sans text-[11px] text-ink-2 mt-0.5 tabular-nums">
                        {due > 0 ? `${due} due` : status === 'completed' ? 'Completed' : 'No cards due'}
                      </p>
                    )}
                  </div>
                  <span
                    className={`shrink-0 mt-0.5 font-sans text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${STATUS_CLASS[status]}`}
                  >
                    {STATUS_LABEL[status]}
                  </span>
                </Link>

                {(status === 'ready' || status === 'completed') && (
                  <div className="flex items-center gap-0 border-t border-rule divide-x divide-rule">
                    <Link
                      href={`/lessons/${lesson.id}?tab=flashcards`}
                      className="flex-1 text-center py-2 font-sans text-[11px] text-ink-2 hover:text-ink hover:bg-paper transition-colors"
                    >
                      Cards {due > 0 ? `(${due} due)` : ''}
                    </Link>
                    <Link
                      href={`/lessons/${lesson.id}?tab=practice`}
                      className="flex-1 text-center py-2 font-sans text-[11px] text-ink-2 hover:text-ink hover:bg-paper transition-colors"
                    >
                      Practice
                    </Link>
                    <button
                      onClick={() => handleRegenerate(lesson)}
                      disabled={isRegenerating}
                      className="flex-1 text-center py-2 font-sans text-[11px] text-ink-2 hover:text-ink hover:bg-paper transition-colors disabled:opacity-40"
                    >
                      {isRegenerating ? 'Generating…' : 'Regenerate'}
                    </button>
                  </div>
                )}

                {status === 'empty' && (
                  <div className="border-t border-rule px-4 py-2">
                    <p className="font-sans text-[11px] text-ink-2">
                      No source content yet.{' '}
                      <Link href="/ingest" className="text-accent hover:underline">
                        Add via Ingest
                      </Link>
                    </p>
                  </div>
                )}

                {status === 'generating' && (
                  <div className="border-t border-rule px-4 py-2 flex items-center gap-2">
                    <Spinner />
                    <p className="font-sans text-[11px] text-ink-2">Generating…</p>
                  </div>
                )}
              </div>
            );
          })
        )}

        <div className="pt-2">
          <Link
            href="/ingest"
            className="block w-full text-center py-3 rounded-md border border-rule font-sans text-sm font-medium text-ink-2 hover:border-accent hover:text-accent transition-colors"
          >
            + Add lesson to this section
          </Link>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}

function EmptyState({ sectionId }: { sectionId?: string }) {
  return (
    <div className="border border-rule rounded-md bg-card p-6 text-center space-y-3">
      <p className="font-serif text-xl font-semibold text-ink">No lessons yet</p>
      <p className="font-sans text-sm text-ink-2 leading-relaxed">
        Paste content from the prep guide to generate flashcards and practice questions.
      </p>
      <Link
        href={sectionId ? `/ingest?section=${sectionId}` : '/ingest'}
        className="inline-block mt-2 px-5 py-2.5 rounded-md bg-accent text-card font-sans text-sm font-medium hover:opacity-90 transition-opacity"
      >
        Add First Lesson
      </Link>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="w-3.5 h-3.5 animate-spin text-ink-2" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
