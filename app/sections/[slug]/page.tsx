'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from '@phosphor-icons/react';
import { createClient } from '@/utils/supabase/client';
import { AppNav } from '@/components/AppNav';
import { CardSkeleton } from '@/components/Skeleton';
import * as db from '@/lib/db';
import { lessonStatus } from '@/lib/db-types';
import { filterDue } from '@/lib/srs';
import type { Section, Lesson, Flashcard } from '@/lib/db-types';

const STATUS_LABEL = {
  empty: 'No source',
  generating: 'Generating',
  ready: 'Ready',
  completed: 'Done',
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

      const cardsByLesson = await Promise.all(sectionLessons.map((l) => db.getFlashcards(supabase, l.id)));
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

  return (
    <div className="min-h-dvh bg-bg pb-24 md:pb-8">
      <AppNav />

      <div className="md:ml-56">
        {/* Header */}
        <header className="px-5 py-4 md:px-8" style={{ borderBottom: '1px solid var(--color-divider)' }}>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-[13px] text-n500 hover:text-fg transition-colors mb-3"
          >
            <ArrowLeft size={14} />
            Home
          </Link>
          {section ? (
            <div>
              <p className="text-[12px] text-n600 mb-1">{Math.round(section.exam_weight * 100)}% of exam</p>
              <h1 className="text-[22px] font-medium text-fg leading-snug tracking-[-0.02em]">
                {section.name}
              </h1>
              <p className="text-[13px] text-n500 mt-1 tabular-nums">
                {completedCount}/{lessons.length} complete
              </p>
            </div>
          ) : (
            <div className="h-7 w-56 animate-pulse rounded" style={{ background: 'var(--color-n900)' }} />
          )}
        </header>

        <div className="max-w-2xl mx-auto px-5 py-6 space-y-2">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)
          ) : lessons.length === 0 ? (
            <EmptyState sectionId={section?.id} />
          ) : (
            lessons.map((lesson, i) => {
              const status = lessonStatus(lesson);
              const due = dueCounts[lesson.id] ?? 0;
              const isRegenerating = regenerating === lesson.id;

              return (
                <div
                  key={lesson.id}
                  className={`rounded-lg overflow-hidden ${i > 0 ? '' : ''}`}
                  style={{ background: 'var(--color-surface)' }}
                >
                  <Link
                    href={`/lessons/${lesson.id}`}
                    className="flex items-start justify-between gap-4 px-4 py-3.5 hover:bg-dim transition-colors group"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] font-medium text-fg leading-snug group-hover:text-accent-md transition-colors">
                        {lesson.title}
                      </p>
                      {status !== 'empty' && (
                        <p className="text-[12px] text-n600 mt-0.5 tabular-nums">
                          {due > 0
                            ? <span style={{ color: 'var(--color-accent-md)' }}>{due} due</span>
                            : status === 'completed' ? 'Completed' : 'No cards due'
                          }
                        </p>
                      )}
                    </div>
                    <StatusTag status={status} />
                  </Link>

                  {(status === 'ready' || status === 'completed') && (
                    <div
                      className="flex items-center"
                      style={{ borderTop: '1px solid var(--color-divider)' }}
                    >
                      <Link
                        href={`/lessons/${lesson.id}?tab=cards`}
                        className="flex-1 text-center py-2 text-[12px] text-n600 hover:text-fg transition-colors"
                      >
                        Cards {due > 0 ? `(${due})` : ''}
                      </Link>
                      <div className="w-px h-4" style={{ background: 'var(--color-divider)' }} />
                      <Link
                        href={`/lessons/${lesson.id}?tab=practice`}
                        className="flex-1 text-center py-2 text-[12px] text-n600 hover:text-fg transition-colors"
                      >
                        Practice
                      </Link>
                      <div className="w-px h-4" style={{ background: 'var(--color-divider)' }} />
                      <button
                        onClick={() => handleRegenerate(lesson)}
                        disabled={isRegenerating}
                        className="flex-1 text-center py-2 text-[12px] text-n600 hover:text-fg transition-colors disabled:opacity-40"
                      >
                        {isRegenerating ? 'Regenerating…' : 'Regenerate'}
                      </button>
                    </div>
                  )}

                  {status === 'empty' && (
                    <div className="px-4 py-2" style={{ borderTop: '1px solid var(--color-divider)' }}>
                      <p className="text-[12px] text-n600">
                        No source.{' '}
                        <Link href="/ingest" style={{ color: 'var(--color-accent-md)' }}>
                          Add via Ingest →
                        </Link>
                      </p>
                    </div>
                  )}

                  {status === 'generating' && (
                    <div className="px-4 py-2 flex items-center gap-2" style={{ borderTop: '1px solid var(--color-divider)' }}>
                      <Spinner />
                      <p className="text-[12px] text-n600">Generating…</p>
                    </div>
                  )}
                </div>
              );
            })
          )}

          <div className="pt-2">
            <Link
              href="/ingest"
              className="btn btn-secondary btn-block"
              style={{ paddingTop: '10px', paddingBottom: '10px' }}
            >
              + Add lesson to this section
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusTag({ status }: { status: 'empty' | 'generating' | 'ready' | 'completed' }) {
  const styles: Record<string, React.CSSProperties> = {
    empty:      { background: 'transparent', color: 'var(--color-n700)', border: '1px solid var(--color-divider)' },
    generating: { background: 'var(--color-accent-dk)', color: 'var(--color-accent-md)', border: 'none' },
    ready:      { background: 'var(--color-accent-dk)', color: 'var(--color-accent-md)', border: 'none' },
    completed:  { background: 'var(--color-n900)', color: 'var(--color-n500)', border: 'none' },
  };
  const STATUS_LABEL = {
    empty: 'No source',
    generating: 'Generating',
    ready: 'Ready',
    completed: 'Done',
  };
  return (
    <span className="tag shrink-0 mt-0.5" style={styles[status]}>
      {STATUS_LABEL[status]}
    </span>
  );
}

function EmptyState({ sectionId }: { sectionId?: string }) {
  return (
    <div className="rounded-lg p-8 text-center space-y-4" style={{ background: 'var(--color-surface)' }}>
      <p className="text-[20px] font-medium text-fg">No lessons yet</p>
      <p className="text-[14px] text-n500 leading-relaxed">
        Paste content from the prep guide to generate flashcards and practice questions.
      </p>
      <Link
        href={sectionId ? `/ingest?section=${sectionId}` : '/ingest'}
        className="btn btn-primary"
        style={{ marginTop: '8px' }}
      >
        Add first lesson
      </Link>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="w-3.5 h-3.5 animate-spin text-n600" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
