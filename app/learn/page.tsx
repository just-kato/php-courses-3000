'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import { BottomNav } from '@/components/BottomNav';
import { CardSkeleton } from '@/components/Skeleton';
import { computeModuleMastery } from '@/lib/gamification';
import * as db from '@/lib/db';
import type { UserModule, UserLesson, UserFlashcard, FlashcardProgress, LessonProgress } from '@/lib/db-types';

type ModuleWithLessons = UserModule & { lessons: UserLesson[] };

export default function LearnPage() {
  const supabase = useMemo(() => createClient(), []);
  const [modules, setModules] = useState<ModuleWithLessons[]>([]);
  const [allFlashcards, setAllFlashcards] = useState<UserFlashcard[]>([]);
  const [fpMap, setFpMap] = useState<Map<string, FlashcardProgress>>(new Map());
  const [lpMap, setLpMap] = useState<Map<string, LessonProgress>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const [userModules, allLessons, flashcards, fpRows, lpRows] = await Promise.all([
        db.getUserModules(supabase, user.id),
        db.getUserLessons(supabase, user.id),
        db.getUserFlashcards(supabase, user.id),
        db.getFlashcardProgress(supabase, user.id),
        db.getLessonProgress(supabase, user.id),
      ]);
      const byModule = new Map<string, UserLesson[]>();
      allLessons.forEach((l) => {
        const arr = byModule.get(l.module_id) ?? [];
        arr.push(l);
        byModule.set(l.module_id, arr);
      });
      setModules(userModules.map((m) => ({ ...m, lessons: byModule.get(m.id) ?? [] })));
      setAllFlashcards(flashcards);
      setFpMap(new Map(fpRows.map((r) => [r.card_id, r])));
      setLpMap(new Map(lpRows.map((r) => [r.lesson_id, r])));
      setLoading(false);
    });
  }, [supabase]);

  return (
    <div className="min-h-dvh bg-paper pb-24">
      <header className="bg-card border-b border-rule px-5 py-3.5">
        <h1 className="font-serif text-lg font-semibold text-ink tracking-tight">Learn</h1>
        <p className="font-sans text-xs text-ink-2 mt-0.5">Browse modules and lessons</p>
      </header>

      <div className="max-w-lg mx-auto px-5 py-6 space-y-6">
        {loading ? (
          Array.from({ length: 2 }).map((_, i) => <CardSkeleton key={i} />)
        ) : modules.length === 0 ? (
          <EmptyState />
        ) : (
          modules.map((mod) => {
            const mastery = computeModuleMastery(mod.id, allFlashcards, fpMap);
            const readCount = mod.lessons.filter((l) => lpMap.get(l.id)?.read).length;

            return (
              <div key={mod.id} className="border border-rule rounded-md bg-card overflow-hidden">
                {/* Module header */}
                <div className="px-4 pt-4 pb-3 border-b border-rule">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      {mod.chapter && (
                        <p className="font-sans text-[11px] text-ink-2 mb-0.5 tabular-nums">{mod.chapter}</p>
                      )}
                      <h2 className="font-serif text-base font-semibold text-ink leading-snug">
                        {mod.title}
                      </h2>
                    </div>
                    <span className="font-sans text-sm tabular-nums text-ink-2 shrink-0 mt-0.5">
                      {mastery}%
                    </span>
                  </div>
                  <div className="mt-3 h-0.75 rounded-sm bg-rule">
                    <div
                      className="h-full bg-accent transition-all"
                      style={{ width: `${mastery}%` }}
                    />
                  </div>
                  <p className="font-sans text-[11px] text-ink-2 mt-1.5 tabular-nums">
                    {readCount} of {mod.lessons.length} lessons read
                  </p>
                </div>

                {/* Lessons */}
                {mod.lessons.length > 0 && (
                  <div className="divide-y divide-rule">
                    {mod.lessons.map((lesson, idx) => {
                      const read = lpMap.get(lesson.id)?.read === true;
                      return (
                        <Link
                          key={lesson.id}
                          href={`/learn/${mod.id}/${lesson.id}`}
                          className="flex items-center gap-3 px-4 py-3 hover:bg-paper transition-colors duration-150 group"
                        >
                          <div
                            className={`flex items-center justify-center w-6 h-6 rounded border text-[11px] font-sans font-semibold shrink-0 tabular-nums transition-colors ${
                              read
                                ? 'border-sage bg-correct text-sage'
                                : 'border-rule text-ink-2'
                            }`}
                          >
                            {read ? '✓' : idx + 1}
                          </div>
                          <span
                            className={`flex-1 font-sans text-sm leading-snug ${
                              read ? 'text-ink-2' : 'text-ink'
                            }`}
                          >
                            {lesson.title}
                          </span>
                          <svg
                            className="w-3.5 h-3.5 text-rule group-hover:text-ink-2 shrink-0 transition-colors"
                            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        </Link>
                      );
                    })}
                  </div>
                )}

                {/* Quick links */}
                <div className="px-4 py-3 flex gap-2 border-t border-rule bg-paper">
                  <Link
                    href={`/flashcards?module=${mod.id}`}
                    className="flex-1 text-center py-1.5 rounded border border-rule font-sans text-xs font-medium text-ink-2 hover:border-ink-2 hover:text-ink transition-colors duration-150"
                  >
                    Flashcards
                  </Link>
                  <Link
                    href={`/practice?module=${mod.id}`}
                    className="flex-1 text-center py-1.5 rounded border border-rule font-sans text-xs font-medium text-ink-2 hover:border-ink-2 hover:text-ink transition-colors duration-150"
                  >
                    Practice Quiz
                  </Link>
                </div>
              </div>
            );
          })
        )}
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
