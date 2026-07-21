'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import { BottomNav } from '@/components/BottomNav';
import { Sidebar } from '@/components/Sidebar';
import type { ModuleWithSections } from '@/components/Sidebar';
import { CardSkeleton } from '@/components/Skeleton';
import { computeModuleMastery } from '@/lib/gamification';
import * as db from '@/lib/db';
import type { UserFlashcard, FlashcardProgress, LessonProgress } from '@/lib/db-types';
import { moduleLabel, sectionLabel } from '@/lib/db-types';

export default function LearnPage() {
  const supabase = useMemo(() => createClient(), []);
  const [modules, setModules] = useState<ModuleWithSections[]>([]);
  const [allFlashcards, setAllFlashcards] = useState<UserFlashcard[]>([]);
  const [fpMap, setFpMap] = useState<Map<string, FlashcardProgress>>(new Map());
  const [lpMap, setLpMap] = useState<Map<string, LessonProgress>>(new Map());
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [generatingWhy, setGeneratingWhy] = useState(false);
  const [whyProgress, setWhyProgress] = useState({ done: 0, total: 0 });

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const [userModules, userSections, allLessons, flashcards, fpRows, lpRows] = await Promise.all([
        db.getUserModules(supabase, user.id),
        db.getUserSections(supabase, user.id),
        db.getUserLessons(supabase, user.id),
        db.getUserFlashcards(supabase, user.id),
        db.getFlashcardProgress(supabase, user.id),
        db.getLessonProgress(supabase, user.id),
      ]);
      const moduleTree: ModuleWithSections[] = userModules.map((m) => ({
        ...m,
        sections: userSections
          .filter((s) => s.module_id === m.id)
          .map((s) => ({ ...s, lessons: allLessons.filter((l) => l.section_id === s.id) })),
      }));
      setModules(moduleTree);
      setAllFlashcards(flashcards);
      setFpMap(new Map(fpRows.map((r) => [r.card_id, r])));
      setLpMap(new Map(lpRows.map((r) => [r.lesson_id, r])));
      setLoading(false);
    });
  }, [supabase]);

  const allLessons = useMemo(
    () => modules.flatMap((m) => m.sections.flatMap((s) => s.lessons)),
    [modules]
  );
  const missingWhy = allLessons.filter((l) => !l.why_it_matters);

  async function handleGenerateAllWhy() {
    if (generatingWhy || missingWhy.length === 0) return;
    setGeneratingWhy(true);
    setWhyProgress({ done: 0, total: missingWhy.length });
    for (const lesson of missingWhy) {
      try {
        const res = await fetch('/api/generate-why', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            notesMarkdown: lesson.notes_markdown,
            title: lesson.title,
            chapter: lesson.chapter,
          }),
        });
        const json = await res.json() as { whyItMatters?: string };
        if (json.whyItMatters) {
          await db.updateLessonWhyItMatters(supabase, lesson.id, json.whyItMatters);
          const why = json.whyItMatters;
          setModules((prev) =>
            prev.map((m) => ({
              ...m,
              sections: m.sections.map((s) => ({
                ...s,
                lessons: s.lessons.map((l) => l.id === lesson.id ? { ...l, why_it_matters: why } : l),
              })),
            }))
          );
        }
      } catch {
        // continue with remaining lessons
      }
      setWhyProgress((p) => ({ ...p, done: p.done + 1 }));
    }
    setGeneratingWhy(false);
  }

  return (
    <div className="h-dvh bg-paper flex flex-col">
      <header className="bg-card border-b border-rule px-5 py-3.5 flex items-center gap-3 shrink-0">
        <button
          onClick={() => setSidebarOpen(true)}
          className="md:hidden p-1.5 -ml-1.5 rounded hover:bg-paper text-ink-2 transition-colors"
          aria-label="Open contents"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
        </button>
        <div>
          <h1 className="font-serif text-lg font-semibold text-ink tracking-tight">Learn</h1>
          <p className="font-sans text-xs text-ink-2 mt-0.5">Browse modules and lessons</p>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          modules={modules}
          lpMap={lpMap}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          getLessonHref={(l, _s, m) => `/learn/${m.id}/${l.id}`}
        />

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-5 py-6 pb-24 space-y-8">
            {!loading && missingWhy.length > 0 && (
              <div className="border border-accent/30 bg-accent-soft rounded-md px-4 py-3 flex items-center justify-between gap-3">
                <p className="font-sans text-xs text-ink leading-snug">
                  <span className="font-medium">{missingWhy.length} lesson{missingWhy.length !== 1 ? 's' : ''}</span> missing "Why It Matters"
                </p>
                <button
                  onClick={handleGenerateAllWhy}
                  disabled={generatingWhy}
                  className="shrink-0 font-sans text-xs font-medium text-accent hover:text-ink disabled:opacity-60 transition-colors"
                >
                  {generatingWhy
                    ? `Generating ${whyProgress.done}/${whyProgress.total}…`
                    : 'Generate all'}
                </button>
              </div>
            )}

            {loading ? (
              Array.from({ length: 2 }).map((_, i) => <CardSkeleton key={i} />)
            ) : modules.length === 0 ? (
              <EmptyState />
            ) : (
              modules.map((mod) => {
                const mastery = computeModuleMastery(mod.id, allFlashcards, fpMap);
                const allModLessons = mod.sections.flatMap((s) => s.lessons);
                const readCount = allModLessons.filter((l) => lpMap.get(l.id)?.read).length;

                return (
                  <section key={mod.id}>
                    <div className="flex items-baseline justify-between mb-3 gap-3">
                      <h2 className="font-serif text-base font-semibold text-ink leading-snug">
                        {moduleLabel(mod)}
                      </h2>
                      <span className="font-sans text-xs text-ink-2 tabular-nums shrink-0">
                        {mastery}% · {readCount}/{allModLessons.length} read
                      </span>
                    </div>

                    <div className="h-0.75 rounded-sm bg-rule mb-4">
                      <div className="h-full bg-accent transition-all" style={{ width: `${mastery}%` }} />
                    </div>

                    {mod.sections.length > 0 ? (
                      <div className="space-y-6">
                        {mod.sections.map((section) => {
                          const secRead = section.lessons.filter((l) => lpMap.get(l.id)?.read).length;
                          return (
                            <div key={section.id}>
                              <div className="flex items-baseline justify-between mb-3 gap-2">
                                <h3 className="font-sans text-xs font-semibold uppercase tracking-wider text-ink-2">
                                  {sectionLabel(section)}
                                </h3>
                                <span className="font-sans text-[11px] text-ink-2/60 tabular-nums shrink-0">
                                  {secRead}/{section.lessons.length}
                                </span>
                              </div>

                              {section.lessons.length > 0 ? (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  {section.lessons.map((lesson) => {
                                    const read = lpMap.get(lesson.id)?.read === true;
                                    return (
                                      <div
                                        key={lesson.id}
                                        className="border border-rule rounded-md bg-card p-4 flex flex-col gap-3"
                                      >
                                        <div className="flex-1 min-w-0 space-y-1">
                                          {lesson.chapter && (
                                            <p className="font-sans text-[10px] font-semibold uppercase tracking-wider text-ink-2/70">
                                              {lesson.chapter}
                                            </p>
                                          )}
                                          <p className="font-sans text-sm font-medium text-ink leading-snug">
                                            {lesson.title}
                                          </p>
                                        </div>
                                        <div className="flex items-center gap-3">
                                          <div className="flex items-center gap-1.5">
                                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${read ? 'bg-sage' : 'bg-rule'}`} />
                                            <span className="font-sans text-[11px] text-ink-2">{read ? 'Read' : 'Not read'}</span>
                                          </div>
                                          {!lesson.why_it_matters && (
                                            <span className="font-sans text-[10px] text-accent/70 border border-accent/30 rounded px-1 py-0.5 leading-none">
                                              No explainer
                                            </span>
                                          )}
                                        </div>
                                        <div className="flex gap-1.5">
                                          <Link
                                            href={`/learn/${mod.id}/${lesson.id}`}
                                            className="flex-1 text-center py-1.5 rounded-md bg-accent text-card font-sans text-xs font-medium hover:opacity-90 transition-opacity"
                                          >
                                            Read
                                          </Link>
                                          <Link
                                            href={`/flashcards?lesson=${lesson.id}`}
                                            className="flex-1 text-center py-1.5 rounded border border-rule font-sans text-xs font-medium text-ink-2 hover:border-ink-2 hover:text-ink transition-colors"
                                          >
                                            Cards
                                          </Link>
                                          <Link
                                            href={`/practice?lesson=${lesson.id}`}
                                            className="flex-1 text-center py-1.5 rounded border border-rule font-sans text-xs font-medium text-ink-2 hover:border-ink-2 hover:text-ink transition-colors"
                                          >
                                            Quiz
                                          </Link>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <p className="font-sans text-sm text-ink-2">No lessons in this section.</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="font-sans text-sm text-ink-2">No sections yet.</p>
                    )}
                  </section>
                );
              })
            )}
          </div>
        </main>
      </div>

      <BottomNav />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="border border-rule rounded-md bg-card p-6 text-center space-y-3">
      <p className="font-serif text-xl font-semibold text-ink">No lessons yet</p>
      <p className="font-sans text-sm text-ink-2 leading-relaxed">
        Paste raw lesson content and let AI generate your flashcards, quiz questions, and study notes.
      </p>
      <Link
        href="/add-lesson"
        className="inline-block mt-2 px-5 py-2.5 rounded-md bg-accent text-card font-sans text-sm font-medium hover:opacity-90 transition-opacity"
      >
        Add First Lesson
      </Link>
    </div>
  );
}
