'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import { AppNav } from '@/components/AppNav';
import { getLevelInfo } from '@/lib/gamification';
import * as db from '@/lib/db';
import { lessonStatus, EXAM_SCORED_QUESTIONS, PASS_THRESHOLD, estimatedScoredQuestions } from '@/lib/db-types';
import { filterDue } from '@/lib/srs';
import type { Profile, Section, Lesson, Flashcard, Attempt } from '@/lib/db-types';

type SectionRow = {
  section: Section;
  lessons: Lesson[];
  dueCount: number;
  secured: number;
  available: number;
};

type DashData = {
  profile: Profile;
  sectionRows: SectionRow[];
  totalDue: number;
  globalAccuracy: number;
};

export default function HomePage() {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<DashData | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;

      const [profile, sections, allLessons, allCards, recentAttempts] =
        await Promise.all([
          db.getProfile(supabase, user.id),
          db.getSections(supabase),
          db.getLessons(supabase, user.id),
          db.getAllFlashcards(supabase, user.id),
          db.getAttempts(supabase, user.id, new Date(Date.now() - 30 * 86400000)),
        ]);

      if (!profile) return;

      const globalAccuracy =
        recentAttempts.length > 0
          ? recentAttempts.filter((a: Attempt) => a.correct).length / recentAttempts.length
          : 0;

      const lessonsBySection = new Map<string, Lesson[]>();
      allLessons.forEach((l) => {
        const arr = lessonsBySection.get(l.section_id) ?? [];
        arr.push(l);
        lessonsBySection.set(l.section_id, arr);
      });

      const cardsByLesson = new Map<string, Flashcard[]>();
      allCards.forEach((c) => {
        const arr = cardsByLesson.get(c.lesson_id) ?? [];
        arr.push(c);
        cardsByLesson.set(c.lesson_id, arr);
      });

      const sectionRows: SectionRow[] = sections.map((section) => {
        const lessons = lessonsBySection.get(section.id) ?? [];
        const sectionCards = lessons.flatMap((l) => cardsByLesson.get(l.id) ?? []);
        const dueCount = filterDue(sectionCards).length;
        const secured = estimatedScoredQuestions(section, globalAccuracy);
        const available = section.exam_weight * EXAM_SCORED_QUESTIONS;
        return { section, lessons, dueCount, secured, available };
      });

      const totalDue = filterDue(allCards).length;
      setData({ profile, sectionRows, totalDue, globalAccuracy });
    });
  }, [supabase]);

  if (!data) {
    return (
      <div className="min-h-dvh bg-bg">
        <div className="md:ml-56 max-w-2xl mx-auto px-5 py-8 space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg" style={{ background: 'var(--color-surface)' }} />
          ))}
        </div>
        <AppNav />
      </div>
    );
  }

  const { profile, sectionRows, totalDue, globalAccuracy } = data;
  const { level } = getLevelInfo(profile.xp);
  const totalSecured = sectionRows.reduce((s, r) => s + r.secured, 0);
  const thresholdPct = (PASS_THRESHOLD / EXAM_SCORED_QUESTIONS) * 100; // 74.8%
  const scorePct = Math.min((totalSecured / EXAM_SCORED_QUESTIONS) * 100, 100);

  // Today's tasks: primary = global review if due, else first section with ready lessons
  const sortedByGap = [...sectionRows].sort((a, b) => (b.available - b.secured) - (a.available - a.secured));

  // Where you stand: sections with any lessons, sorted by gap desc
  const standRows = sortedByGap.filter((r) => r.lessons.length > 0 || r.section.exam_weight > 0);

  return (
    <div className="min-h-dvh bg-bg pb-24 md:pb-8">
      <AppNav />

      <div className="md:ml-56">
        {/* Header — desktop only (phone uses AppNav) */}
        <header className="hidden md:flex items-center justify-between px-8 py-5 border-b border-divider">
          <div>
            <h1 className="text-[17px] font-medium text-fg">Good day</h1>
            <p className="text-[13px] text-n500 mt-0.5">
              {profile.current_streak > 0 && `${profile.current_streak} day streak 🔥 · `}
              Level {level}
            </p>
          </div>
        </header>

        <div className="max-w-2xl mx-auto px-5 py-6 space-y-8">

          {/* ── Exam score strip ── */}
          <div className="rounded-lg px-4 py-4 space-y-3" style={{ background: 'var(--color-surface)' }}>
            <div className="flex items-baseline justify-between">
              <span className="text-[14px] font-medium text-fg">Estimated exam score</span>
              <span className="text-[13px] tabular-nums text-n500">
                {totalSecured.toFixed(1)} / {PASS_THRESHOLD} to pass
              </span>
            </div>
            {/* Bar with threshold tick */}
            <div className="relative h-1.25 rounded-sm" style={{ background: 'var(--color-bg)' }}>
              <div
                className="absolute inset-y-0 left-0 rounded-sm transition-all duration-500"
                style={{
                  width: `${scorePct}%`,
                  background: 'var(--color-accent)',
                  boxShadow: '0 0 12px rgba(145,132,217,.6)',
                }}
              />
              {/* Threshold tick */}
              <div
                className="absolute -top-0.75 w-px h-2.75"
                style={{ left: `${thresholdPct}%`, background: 'var(--color-accent-hi)' }}
              />
            </div>
            <p className="text-[12px] text-n600">
              Based on {Math.round(globalAccuracy * 100)}% accuracy · {EXAM_SCORED_QUESTIONS} scored questions
            </p>
          </div>

          {/* ── Today ── */}
          <div className="space-y-3">
            <h2 className="text-[13px] font-medium uppercase tracking-wide text-n600">Today</h2>

            {totalDue > 0 ? (
              <Link
                href="/review"
                className="block rounded-lg p-4 transition-colors"
                style={{ border: '1px solid var(--color-accent)' }}
              >
                <p className="text-[15px] font-medium text-fg">
                  Review {totalDue} card{totalDue !== 1 ? 's' : ''}
                </p>
                <p className="text-[13px] text-n500 mt-0.5">Due for spaced repetition</p>
              </Link>
            ) : (
              <Link
                href="/ingest"
                className="block rounded-lg p-4 transition-colors"
                style={{ border: '1px solid var(--color-accent)' }}
              >
                <p className="text-[15px] font-medium text-fg">Add a lesson</p>
                <p className="text-[13px] text-n500 mt-0.5">Paste content to generate flashcards</p>
              </Link>
            )}

            {/* Secondary tasks */}
            {sortedByGap.slice(0, 2).map(({ section, lessons, dueCount }) => {
              const readyCount = lessons.filter((l) => lessonStatus(l) === 'ready').length;
              const completedCount = lessons.filter((l) => l.completed_at).length;
              const hint = dueCount > 0
                ? `${dueCount} cards due`
                : readyCount > 0
                ? `${readyCount} lesson${readyCount !== 1 ? 's' : ''} ready`
                : completedCount > 0
                ? `${completedCount} complete`
                : 'No lessons yet';
              return (
                <Link
                  key={section.id}
                  href={`/sections/${section.slug}`}
                  className="flex items-center justify-between rounded-lg px-4 py-3 transition-colors"
                  style={{ background: 'var(--color-surface)' }}
                >
                  <div>
                    <p className="text-[14px] font-medium text-fg leading-snug">{section.name}</p>
                    <p className="text-[12px] text-n500 mt-0.5">{hint}</p>
                  </div>
                  <span className="text-n600 text-[13px]">→</span>
                </Link>
              );
            })}
          </div>

          <div style={{ height: '1px', background: 'var(--color-divider)' }} />

          {/* ── Where you stand ── */}
          <div className="space-y-3">
            <h2 className="text-[13px] font-medium uppercase tracking-wide text-n600">Where you stand</h2>
            <div className="rounded-lg overflow-hidden" style={{ background: 'var(--color-surface)' }}>
              {standRows.map(({ section, lessons, secured, available }, i) => {
                const completedLessons = lessons.filter((l) => l.completed_at).length;
                const pct = available > 0 ? Math.min(secured / available, 1) : 0;
                return (
                  <Link
                    key={section.id}
                    href={`/sections/${section.slug}`}
                    className={`flex items-center gap-4 px-4 py-3 transition-colors hover:bg-dim ${i > 0 ? 'row-rule' : ''}`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-fg truncate">{section.name}</p>
                      <p className="text-[11px] text-n600 tabular-nums">
                        {completedLessons}/{lessons.length} lessons · {Math.round(section.exam_weight * 100)}% of exam
                      </p>
                    </div>
                    <div className="w-24 shrink-0">
                      <div className="flex items-center justify-end gap-1.5 mb-1">
                        <span className="text-[12px] tabular-nums text-n400">{secured.toFixed(1)}</span>
                        <span className="text-[11px] text-n700">/ {available.toFixed(0)} pts</span>
                      </div>
                      <div className="flex h-1.5 rounded-sm overflow-hidden" style={{ background: 'var(--color-accent-dk)' }}>
                        <div
                          className="h-full rounded-sm transition-all duration-500"
                          style={{ width: `${pct * 100}%`, background: 'var(--color-accent)' }}
                        />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
