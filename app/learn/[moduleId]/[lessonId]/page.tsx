'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import { BottomNav } from '@/components/BottomNav';
import { AchievementToast } from '@/components/AchievementToast';
import { HomeSkeleton } from '@/components/Skeleton';
import { useAchievements } from '@/hooks/useAchievements';
import * as db from '@/lib/db';
import { getLevelInfo } from '@/lib/gamification';
import type { UserLesson, UserModule } from '@/lib/db-types';

export default function LessonPage() {
  const params = useParams<{ moduleId: string; lessonId: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [userId, setUserId] = useState<string | null>(null);
  const [mod, setMod] = useState<UserModule | null>(null);
  const [lesson, setLesson] = useState<UserLesson | null>(null);
  const [moduleLessons, setModuleLessons] = useState<UserLesson[]>([]);
  const [isRead, setIsRead] = useState(false);
  const [marking, setMarking] = useState(false);
  const [xpBump, setXpBump] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const { newlyUnlocked, checkAndAward, clearNewlyUnlocked } = useAchievements(userId ?? undefined);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.replace('/sign-in'); return; }
      setUserId(user.id);

      const [fetchedLesson, fetchedMod, allLessons, lpRows] = await Promise.all([
        db.getUserLessonById(supabase, params.lessonId),
        db.getUserModuleById(supabase, params.moduleId),
        db.getUserLessons(supabase, user.id, params.moduleId),
        db.getLessonProgress(supabase, user.id),
      ]);

      setLesson(fetchedLesson);
      setMod(fetchedMod);
      setModuleLessons(allLessons);
      setIsRead(lpRows.some((r) => r.lesson_id === params.lessonId && r.read));
      setLoading(false);
    });
  }, [supabase, params.lessonId, params.moduleId, router]);

  async function handleMarkRead() {
    if (!userId || !lesson || isRead || marking) return;
    setMarking(true);
    setIsRead(true);
    const XP = 10;
    await db.upsertLessonProgress(supabase, userId, lesson.id, true);
    const profile = await db.getProfile(supabase, userId);
    if (profile) {
      const newXP = profile.xp + XP;
      await db.upsertProfile(supabase, userId, { xp: newXP, level: getLevelInfo(newXP).level });
      setXpBump(XP);
      setTimeout(() => setXpBump(null), 2500);
    }
    const [lessonRows, p] = await Promise.all([
      db.getLessonProgress(supabase, userId),
      db.getProfile(supabase, userId),
    ]);
    if (p) {
      await checkAndAward({
        totalCardsEverReviewed: 0,
        lessonsRead: lessonRows.filter((r) => r.read).length,
        streak: p.current_streak,
        level: getLevelInfo(p.xp).level,
        dailyCardCount: 0,
        dailyGoal: p.daily_goal,
      });
    }
    setMarking(false);
  }

  if (loading || !userId) return <HomeSkeleton />;

  if (!lesson || !mod) {
    return (
      <div className="min-h-dvh bg-paper flex items-center justify-center font-sans text-sm text-ink-2">
        Lesson not found.{' '}
        <Link href="/learn" className="text-accent underline underline-offset-2 ml-1">
          Back to Learn
        </Link>
      </div>
    );
  }

  const lessonIndex = moduleLessons.findIndex((l) => l.id === lesson.id);
  const prevLesson = lessonIndex > 0 ? moduleLessons[lessonIndex - 1] : null;
  const nextLesson = lessonIndex >= 0 && lessonIndex < moduleLessons.length - 1
    ? moduleLessons[lessonIndex + 1]
    : null;

  return (
    <div className="min-h-dvh bg-paper pb-28">
      {/* Header */}
      <header className="bg-card border-b border-rule px-5 py-3 flex items-center gap-3">
        <button
          onClick={() => router.push('/learn')}
          className="flex items-center justify-center w-7 h-7 rounded hover:bg-paper transition-colors duration-150"
        >
          <svg className="w-4 h-4 text-ink-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-sans text-[11px] text-ink-2 truncate">{mod.title}</p>
          <h1 className="font-sans text-sm font-medium text-ink truncate">{lesson.title}</h1>
        </div>
        {isRead && (
          <span className="font-sans text-xs text-sage font-medium shrink-0">✓ Read</span>
        )}
      </header>

      {/* Reading progress within module */}
      <div className="h-0.75 bg-rule">
        <div
          className="h-full bg-accent/60 transition-all"
          style={{ width: `${moduleLessons.length > 0 ? ((lessonIndex + 1) / moduleLessons.length) * 100 : 0}%` }}
        />
      </div>

      {/* Content */}
      <div className="max-w-prose mx-auto px-5 py-8">
        <h1 className="font-serif text-2xl font-semibold text-ink leading-snug mb-6">
          {lesson.title}
        </h1>

        <MarkdownRenderer content={lesson.notes_markdown} />

        {/* End-of-lesson actions */}
        <div className="mt-10 pt-6 border-t border-rule space-y-4">
          {!isRead ? (
            <button
              onClick={handleMarkRead}
              disabled={marking}
              className="w-full py-2.5 rounded-md border border-rule bg-card text-ink font-sans text-sm font-medium hover:border-ink-2 disabled:opacity-50 transition-colors duration-150 active:scale-[0.99]"
            >
              {marking ? 'Marking…' : 'Mark as Read  +10 XP'}
            </button>
          ) : (
            <div className="flex items-center justify-center gap-2 py-2.5 rounded-md bg-correct border border-sage/30">
              <span className="text-sage text-sm">✓</span>
              <span className="font-sans text-sm font-medium text-sage">Lesson complete</span>
              {xpBump && (
                <span className="font-sans text-xs font-semibold text-accent tabular-nums animate-pulse">
                  +{xpBump} XP
                </span>
              )}
            </div>
          )}

          <div className="flex gap-3">
            {prevLesson ? (
              <Link
                href={`/learn/${mod.id}/${prevLesson.id}`}
                className="flex-1 py-2.5 rounded-md border border-rule font-sans text-sm font-medium text-ink-2 text-center hover:border-ink-2 hover:text-ink transition-colors duration-150"
              >
                ← Previous
              </Link>
            ) : (
              <div className="flex-1" />
            )}
            {nextLesson ? (
              <Link
                href={`/learn/${mod.id}/${nextLesson.id}`}
                className="flex-1 py-2.5 rounded-md bg-accent text-card font-sans text-sm font-medium text-center hover:opacity-90 transition-opacity duration-150"
              >
                Next →
              </Link>
            ) : (
              <Link
                href="/learn"
                className="flex-1 py-2.5 rounded-md bg-accent text-card font-sans text-sm font-medium text-center hover:opacity-90 transition-opacity duration-150"
              >
                All Modules
              </Link>
            )}
          </div>
        </div>
      </div>

      <AchievementToast achievementIds={newlyUnlocked} onDismiss={clearNewlyUnlocked} />
      <BottomNav />
    </div>
  );
}
