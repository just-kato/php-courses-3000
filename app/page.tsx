'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import { BottomNav } from '@/components/BottomNav';
import { ProgressRing } from '@/components/ProgressRing';
import { HomeSkeleton } from '@/components/Skeleton';
import { getLevelInfo, ACHIEVEMENTS, computeModuleMastery } from '@/lib/gamification';
import * as db from '@/lib/db';
import type {
  Profile,
  FlashcardProgress,
  DBachievement,
  UserModule,
  UserFlashcard,
} from '@/lib/db-types';

type DashData = {
  profile: Profile;
  userModules: UserModule[];
  userFlashcards: UserFlashcard[];
  flashcardProgress: Map<string, FlashcardProgress>;
  achievements: DBachievement[];
  dailyCardCount: number;
  dailyQuizCount: number;
  readCount: number;
};

export default function HomePage() {
  const [data, setData] = useState<DashData | null>(null);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const [profile, userModules, userFlashcards, fpRows, achievements, dailyCardCount, dailyQuizCount, lessonRows] =
        await Promise.all([
          db.getProfile(supabase, user.id),
          db.getUserModules(supabase, user.id),
          db.getUserFlashcards(supabase, user.id),
          db.getFlashcardProgress(supabase, user.id),
          db.getUserAchievements(supabase, user.id),
          db.getDailyCardCount(supabase, user.id),
          db.getDailyQuizCount(supabase, user.id),
          db.getLessonProgress(supabase, user.id),
        ]);
      if (!profile) return;
      setData({
        profile,
        userModules,
        userFlashcards,
        flashcardProgress: new Map(fpRows.map((r) => [r.card_id, r])),
        achievements,
        dailyCardCount,
        dailyQuizCount,
        readCount: lessonRows.filter((r) => r.read).length,
      });
    });
  }, [supabase]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = '/sign-in';
  }

  if (!data) return <HomeSkeleton />;

  const { profile, userModules, userFlashcards, flashcardProgress, achievements, dailyCardCount, dailyQuizCount, readCount } = data;
  const { level, xpInLevel, xpForNextLevel, progress: xpProgress } = getLevelInfo(profile.xp);
  const dailyTotal = dailyCardCount + dailyQuizCount;
  const dailyProgress = Math.min(dailyTotal / profile.daily_goal, 1);
  const earnedIds = new Set(achievements.map((a) => a.achievement_id));

  return (
    <div className="min-h-dvh bg-paper pb-24">

      {/* Header */}
      <header className="bg-card border-b border-rule px-5 py-3.5 flex items-center justify-between">
        <h1 className="font-serif text-lg font-semibold text-ink tracking-tight">MLO Study</h1>
        <button
          onClick={handleSignOut}
          className="font-sans text-xs text-ink-2 hover:text-ink transition-colors duration-150"
        >
          Sign out
        </button>
      </header>

      <div className="max-w-lg mx-auto px-5 py-6 space-y-6">

        {/* Streak + Level + XP */}
        <div className="space-y-4">
          <div className="flex items-start gap-8">
            <div>
              <div className="font-sans tabular-nums text-3xl font-semibold text-ink leading-none">
                {profile.current_streak}
              </div>
              <div className="font-sans text-xs text-ink-2 mt-1">
                day streak {profile.current_streak > 0 ? '🔥' : ''}
              </div>
              {profile.longest_streak > 0 && (
                <div className="font-sans text-[11px] text-ink-2 opacity-60 mt-0.5 tabular-nums">
                  best: {profile.longest_streak}
                </div>
              )}
            </div>

            <div className="w-px self-stretch bg-rule" />

            <div className="flex-1 space-y-2">
              <div className="flex items-baseline justify-between">
                <span className="font-sans font-semibold text-ink tabular-nums">Level {level}</span>
                <span className="font-sans text-xs text-ink-2 tabular-nums">{profile.xp.toLocaleString()} XP</span>
              </div>
              <div className="h-0.75 rounded-sm bg-rule overflow-hidden">
                <div
                  className="h-full bg-accent transition-all duration-500"
                  style={{ width: `${xpProgress * 100}%` }}
                />
              </div>
              <p className="font-sans text-xs text-ink-2 tabular-nums">
                {xpInLevel} / {xpForNextLevel} to next level
              </p>
            </div>
          </div>
        </div>

        <div className="border-t border-rule" />

        {/* Daily goal */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="font-sans text-sm font-medium text-ink">Today's goal</span>
              <span className="font-sans text-xs text-ink-2 tabular-nums">
                {dailyTotal} / {profile.daily_goal}
              </span>
            </div>
            <div className="h-0.75 rounded-sm bg-rule overflow-hidden">
              <div
                className="h-full bg-accent transition-all duration-500"
                style={{ width: `${dailyProgress * 100}%` }}
              />
            </div>
            <p className="font-sans text-xs text-ink-2">
              {dailyCardCount} cards · {dailyQuizCount} questions
            </p>
          </div>
          <ProgressRing progress={dailyProgress} size={60} strokeWidth={4}>
            <span className="font-sans text-xs font-semibold text-ink tabular-nums">
              {Math.round(dailyProgress * 100)}%
            </span>
          </ProgressRing>
        </div>

        <div className="border-t border-rule" />

        {/* Modules */}
        {userModules.length > 0 ? (
          <div className="space-y-3">
            <h2 className="font-serif text-base font-semibold text-ink">Modules</h2>
            {userModules.map((mod) => {
              const mastery = computeModuleMastery(mod.id, userFlashcards, flashcardProgress);
              const cardCount = userFlashcards.filter((c) => c.module_id === mod.id).length;
              const started = userFlashcards.filter(
                (c) => c.module_id === mod.id && flashcardProgress.has(c.id)
              ).length;

              return (
                <Link
                  key={mod.id}
                  href={`/learn/${mod.id}`}
                  className="block border border-rule rounded-md bg-card p-4 hover:border-ink-2 transition-colors duration-150"
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      {mod.chapter && (
                        <p className="font-sans text-[11px] text-ink-2 mb-0.5">{mod.chapter}</p>
                      )}
                      <h3 className="font-serif text-base font-medium text-ink leading-snug">{mod.title}</h3>
                    </div>
                    <span className="font-sans text-sm tabular-nums text-ink-2 shrink-0">{mastery}%</span>
                  </div>
                  <div className="h-0.75 rounded-sm bg-rule mb-2">
                    <div
                      className="h-full bg-accent transition-all"
                      style={{ width: `${mastery}%` }}
                    />
                  </div>
                  <p className="font-sans text-xs text-ink-2 tabular-nums">
                    {started}/{cardCount} cards · {mastery}% mastery
                  </p>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="space-y-3">
            <h2 className="font-serif text-base font-semibold text-ink">Get started</h2>
            <Link
              href="/add-lesson"
              className="block border border-rule rounded-md bg-card p-5 hover:border-ink-2 transition-colors duration-150 text-center"
            >
              <p className="font-sans text-sm font-medium text-ink mb-1">Add your first lesson</p>
              <p className="font-sans text-xs text-ink-2">Paste raw content and AI generates everything</p>
            </Link>
          </div>
        )}

        <div className="border-t border-rule" />

        {/* Quick study */}
        <div className="space-y-3">
          <h2 className="font-serif text-base font-semibold text-ink">Study now</h2>
          <div className="grid grid-cols-2 gap-3">
            <Link
              href="/flashcards"
              className="flex flex-col gap-1.5 px-4 py-3.5 rounded-md border border-rule bg-card hover:border-ink-2 transition-colors duration-150 active:scale-[0.99]"
            >
              <span className="text-lg">🃏</span>
              <span className="font-sans text-sm font-medium text-ink">Flashcards</span>
              <span className="font-sans text-xs text-ink-2">Leitner review</span>
            </Link>
            <Link
              href="/practice"
              className="flex flex-col gap-1.5 px-4 py-3.5 rounded-md border border-rule bg-card hover:border-ink-2 transition-colors duration-150 active:scale-[0.99]"
            >
              <span className="text-lg">📝</span>
              <span className="font-sans text-sm font-medium text-ink">Practice Quiz</span>
              <span className="font-sans text-xs text-ink-2">Multiple choice</span>
            </Link>
          </div>
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
                    earned
                      ? 'border-rule bg-card text-ink'
                      : 'border-rule/50 bg-paper text-ink-2 opacity-30'
                  }`}
                >
                  <span className="text-xl leading-none">{a.icon}</span>
                  <span className="font-sans text-[9px] text-ink-2 leading-tight">{a.title}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="border-t border-rule" />

        {/* Stats footer */}
        <div className="grid grid-cols-3 gap-4 text-center">
          {[
            { value: flashcardProgress.size, label: 'Cards touched' },
            { value: readCount, label: 'Lessons read' },
            { value: userFlashcards.length, label: 'Total cards' },
          ].map(({ value, label }) => (
            <div key={label}>
              <div className="font-sans tabular-nums text-2xl font-semibold text-ink">{value}</div>
              <div className="font-sans text-[11px] text-ink-2 mt-0.5 leading-tight">{label}</div>
            </div>
          ))}
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
