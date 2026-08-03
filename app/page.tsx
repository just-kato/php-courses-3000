'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import { BottomNav } from '@/components/BottomNav';
import { getLevelInfo, ACHIEVEMENTS } from '@/lib/gamification';
import * as db from '@/lib/db';
import { lessonStatus, EXAM_SCORED_QUESTIONS, PASS_THRESHOLD, estimatedScoredQuestions } from '@/lib/db-types';
import { filterDue } from '@/lib/srs';
import type { Profile, Section, Lesson, Flashcard, Attempt, DBachievement } from '@/lib/db-types';

type SectionStats = {
  section: Section;
  lessons: Lesson[];
  dueCount: number;
  accuracy: number; // 0-1, from recent attempts
  estimatedScore: number;
};

type DashData = {
  profile: Profile;
  achievements: DBachievement[];
  sectionStats: SectionStats[];
  totalDue: number;
};

export default function HomePage() {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<DashData | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;

      const [profile, sections, allLessons, allCards, recentAttempts, achievements] =
        await Promise.all([
          db.getProfile(supabase, user.id),
          db.getSections(supabase),
          db.getLessons(supabase, user.id),
          db.getAllFlashcards(supabase, user.id),
          db.getAttempts(supabase, user.id, new Date(Date.now() - 30 * 86400000)),
          db.getUserAchievements(supabase, user.id),
        ]);

      if (!profile) return;

      // Build per-section stats
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

      // Attempts grouped by question → lesson → section requires more joins;
      // use global accuracy for now (all recent attempts)
      const globalAccuracy =
        recentAttempts.length > 0
          ? recentAttempts.filter((a: Attempt) => a.correct).length / recentAttempts.length
          : 0;

      const sectionStats: SectionStats[] = sections.map((section) => {
        const lessons = lessonsBySection.get(section.id) ?? [];
        const sectionCards = lessons.flatMap((l) => cardsByLesson.get(l.id) ?? []);
        const dueCount = filterDue(sectionCards).length;
        const estimatedScore = estimatedScoredQuestions(section, globalAccuracy);
        return { section, lessons, dueCount, accuracy: globalAccuracy, estimatedScore };
      });

      const totalDue = filterDue(allCards).length;

      setData({ profile, achievements, sectionStats, totalDue });
    });
  }, [supabase]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = '/sign-in';
  }

  if (!data) {
    return (
      <div className="min-h-dvh bg-paper pb-28">
        <div className="max-w-lg mx-auto px-5 py-8 space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-md bg-rule opacity-30" />
          ))}
        </div>
        <BottomNav />
      </div>
    );
  }

  const { profile, achievements, sectionStats, totalDue } = data;
  const { level, xpInLevel, xpForNextLevel, progress: xpProgress } = getLevelInfo(profile.xp);
  const earnedIds = new Set(achievements.map((a) => a.achievement_id));

  const totalEstimated = sectionStats.reduce((s, ss) => s + ss.estimatedScore, 0);
  const overallProgress = Math.min(totalEstimated / PASS_THRESHOLD, 1);

  return (
    <div className="min-h-dvh bg-paper pb-28">
      <header className="bg-card border-b border-rule px-5 py-3.5 flex items-center justify-between">
        <h1 className="font-serif text-lg font-semibold text-ink tracking-tight">MLO Study</h1>
        <button
          onClick={handleSignOut}
          className="font-sans text-xs text-ink-2 hover:text-ink transition-colors"
        >
          Sign out
        </button>
      </header>

      <div className="max-w-lg mx-auto px-5 py-6 space-y-6">

        {/* Streak + Level */}
        <div className="flex items-start gap-6">
          <div className="shrink-0">
            <div className="font-sans tabular-nums text-3xl font-semibold text-ink leading-none">
              {profile.current_streak}
            </div>
            <div className="font-sans text-xs text-ink-2 mt-1">
              day streak{profile.current_streak > 0 ? ' 🔥' : ''}
            </div>
          </div>
          <div className="w-px self-stretch bg-rule" />
          <div className="flex-1 space-y-1.5">
            <div className="flex items-baseline justify-between">
              <span className="font-sans font-semibold text-ink">Level {level}</span>
              <span className="font-sans text-xs text-ink-2 tabular-nums">{profile.xp.toLocaleString()} XP</span>
            </div>
            <div className="h-0.75 rounded-sm bg-rule overflow-hidden">
              <div className="h-full bg-accent transition-all duration-500" style={{ width: `${xpProgress * 100}%` }} />
            </div>
            <p className="font-sans text-[11px] text-ink-2 tabular-nums">
              {xpInLevel} / {xpForNextLevel} to next level
            </p>
          </div>
        </div>

        {/* Exam progress */}
        <div className="border border-rule rounded-md bg-card px-4 py-4 space-y-3">
          <div className="flex items-baseline justify-between">
            <span className="font-sans text-sm font-semibold text-ink">Estimated exam score</span>
            <span className="font-sans text-sm tabular-nums text-ink-2">
              {totalEstimated.toFixed(1)} / {PASS_THRESHOLD} to pass
            </span>
          </div>
          <div className="h-1.5 rounded-sm bg-rule overflow-hidden">
            <div
              className="h-full bg-accent transition-all duration-500"
              style={{ width: `${overallProgress * 100}%` }}
            />
          </div>
          <p className="font-sans text-[11px] text-ink-2">
            Based on accuracy across {EXAM_SCORED_QUESTIONS} scored questions · weighted by section
          </p>
        </div>

        {/* Due cards */}
        {totalDue > 0 && (
          <Link
            href="/review"
            className="flex items-center justify-between border border-rule rounded-md bg-card px-4 py-3.5 hover:border-accent transition-colors group"
          >
            <div>
              <p className="font-sans text-sm font-semibold text-ink">
                {totalDue} card{totalDue !== 1 ? 's' : ''} due
              </p>
              <p className="font-sans text-[11px] text-ink-2 mt-0.5">Tap to review now</p>
            </div>
            <span className="font-sans text-xs text-ink-2 group-hover:text-accent transition-colors">→</span>
          </Link>
        )}

        <div className="border-t border-rule" />

        {/* Sections */}
        <div className="space-y-3">
          <h2 className="font-serif text-base font-semibold text-ink">Sections</h2>
          {sectionStats.map(({ section, lessons, dueCount, estimatedScore }) => {
            const completedLessons = lessons.filter((l) => l.completed_at).length;
            const readyLessons = lessons.filter((l) => lessonStatus(l) === 'ready' || l.completed_at).length;
            const sectionProgress = lessons.length > 0 ? completedLessons / lessons.length : 0;

            return (
              <Link
                key={section.id}
                href={`/sections/${section.slug}`}
                className="block border border-rule rounded-md bg-card p-4 hover:border-ink-2 transition-colors duration-150 group"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-sans text-[10px] font-semibold uppercase tracking-wider text-ink-2 mb-0.5">
                      {Math.round(section.exam_weight * 100)}% of exam
                    </p>
                    <h3 className="font-serif text-sm font-semibold text-ink leading-snug group-hover:text-accent transition-colors">
                      {section.name}
                    </h3>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-sans tabular-nums text-sm font-semibold text-ink">
                      {estimatedScore.toFixed(1)}
                    </p>
                    <p className="font-sans text-[10px] text-ink-2">est. pts</p>
                  </div>
                </div>

                <div className="h-0.75 rounded-sm bg-rule mb-2">
                  <div className="h-full bg-accent transition-all" style={{ width: `${sectionProgress * 100}%` }} />
                </div>

                <div className="flex items-center justify-between">
                  <p className="font-sans text-[11px] text-ink-2 tabular-nums">
                    {completedLessons}/{lessons.length} lessons complete
                    {readyLessons > completedLessons ? ` · ${readyLessons - completedLessons} ready` : ''}
                  </p>
                  {dueCount > 0 && (
                    <p className="font-sans text-[11px] text-accent tabular-nums">
                      {dueCount} due
                    </p>
                  )}
                </div>
              </Link>
            );
          })}
        </div>

        <div className="border-t border-rule" />

        {/* Achievements */}
        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="font-serif text-base font-semibold text-ink">Achievements</h2>
            <span className="font-sans text-xs text-ink-2 tabular-nums">
              {achievements.length} / {ACHIEVEMENTS.length}
            </span>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {ACHIEVEMENTS.map((a) => {
              const earned = earnedIds.has(a.id);
              return (
                <div
                  key={a.id}
                  title={`${a.title}: ${a.description}`}
                  className={`flex flex-col items-center gap-1 p-2 rounded-md border text-center transition-colors ${
                    earned ? 'border-rule bg-card' : 'border-rule/40 bg-paper opacity-25'
                  }`}
                >
                  <span className="text-xl leading-none">{a.icon}</span>
                  <span className="font-sans text-[9px] text-ink-2 leading-tight">{a.title}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
