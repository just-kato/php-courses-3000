'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { BottomNav } from '@/components/BottomNav';
import { Sidebar } from '@/components/Sidebar';
import { FlashCard } from '@/components/FlashCard';
import { AchievementToast } from '@/components/AchievementToast';
import { HomeSkeleton } from '@/components/Skeleton';
import { useProfile } from '@/hooks/useProfile';
import { useFlashcardProgress } from '@/hooks/useFlashcardProgress';
import { useAchievements } from '@/hooks/useAchievements';
import { filterDueCards, shuffle } from '@/lib/leitner';
import { XP_CARD_REVIEW, XP_CARD_CORRECT_BONUS, getLevelInfo } from '@/lib/gamification';
import * as db from '@/lib/db';
import type { UserModule, UserLesson, UserFlashcard, LessonProgress } from '@/lib/db-types';
import { scopeFromParams, lessonLabel } from '@/lib/db-types';

export default function FlashcardsPage() {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <FlashcardsContent />
    </Suspense>
  );
}

function FlashcardsContent() {
  const searchParams = useSearchParams();
  const lessonParam = searchParams.get('lesson');
  const moduleParam = searchParams.get('module');
  const scope = scopeFromParams(lessonParam, moduleParam);
  const scopeKey = lessonParam ?? moduleParam ?? 'all';

  const supabase = useMemo(() => createClient(), []);

  const [userId, setUserId] = useState<string | null>(null);
  const [userModules, setUserModules] = useState<UserModule[]>([]);
  const [allLessons, setAllLessons] = useState<UserLesson[]>([]);
  const [allFlashcards, setAllFlashcards] = useState<UserFlashcard[]>([]);
  const [lpMap, setLpMap] = useState<Map<string, LessonProgress>>(new Map());
  const [contentLoading, setContentLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [sessionCards, setSessionCards] = useState<UserFlashcard[]>([]);
  const [cardIndex, setCardIndex] = useState(0);
  const [stats, setStats] = useState({ correct: 0, incorrect: 0 });
  const [sessionDone, setSessionDone] = useState(false);
  const [showAllCards, setShowAllCards] = useState(false);

  const { profile, awardXP } = useProfile(userId ?? undefined);
  const { progressMap, recordCardReview, totalReviewed } = useFlashcardProgress(userId ?? undefined);
  const { newlyUnlocked, checkAndAward, clearNewlyUnlocked } = useAchievements(userId ?? undefined);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      setUserId(user.id);
      const [mods, lessons, cards, lpRows] = await Promise.all([
        db.getUserModules(supabase, user.id),
        db.getUserLessons(supabase, user.id),
        db.getUserFlashcards(supabase, user.id),
        db.getLessonProgress(supabase, user.id),
      ]);
      setUserModules(mods);
      setAllLessons(lessons);
      setAllFlashcards(cards);
      setLpMap(new Map(lpRows.map((r) => [r.lesson_id, r])));
      setContentLoading(false);
    });
  }, [supabase]);

  // Reset session when scope changes
  useEffect(() => {
    setSessionCards([]);
    setSessionDone(false);
  }, [scopeKey]);

  const modulesWithLessons = useMemo(() => {
    const byModule = new Map<string, UserLesson[]>();
    allLessons.forEach((l) => {
      const arr = byModule.get(l.module_id) ?? [];
      arr.push(l);
      byModule.set(l.module_id, arr);
    });
    return userModules.map((m) => ({ ...m, lessons: byModule.get(m.id) ?? [] }));
  }, [userModules, allLessons]);

  const filteredCards = useMemo(() => {
    if (scope.type === 'module') return allFlashcards.filter((c) => c.module_id === scope.id);
    if (scope.type === 'lesson') return allFlashcards.filter((c) => c.lesson_id === scope.id);
    return allFlashcards;
  }, [scope, allFlashcards]);

  const dueCards = useMemo(() => {
    if (progressMap.size === 0 && filteredCards.length > 0) return filteredCards;
    return filterDueCards(filteredCards, progressMap);
  }, [filteredCards, progressMap]);

  const scopeLabel = useMemo(() => {
    if (scope.type === 'module') return userModules.find((m) => m.id === scope.id)?.title ?? null;
    if (scope.type === 'lesson') {
      const l = allLessons.find((l) => l.id === scope.id);
      return l ? lessonLabel(l) : null;
    }
    return null;
  }, [scope, userModules, allLessons]);

  function startSession(useAll = false) {
    const pool = useAll ? filteredCards : dueCards;
    setSessionCards(shuffle(pool));
    setCardIndex(0);
    setStats({ correct: 0, incorrect: 0 });
    setSessionDone(false);
    setShowAllCards(useAll);
  }

  const currentCard = sessionCards[cardIndex];

  async function handleAnswer(correct: boolean) {
    if (!currentCard || !userId) return;
    await recordCardReview(currentCard.id, correct);
    const xp = XP_CARD_REVIEW + (correct ? XP_CARD_CORRECT_BONUS : 0);
    await awardXP(xp);
    const newStats = {
      correct: stats.correct + (correct ? 1 : 0),
      incorrect: stats.incorrect + (correct ? 0 : 1),
    };
    setStats(newStats);
    if (cardIndex + 1 >= sessionCards.length) {
      setSessionDone(true);
      if (profile) {
        await checkAndAward({
          totalCardsEverReviewed: totalReviewed + 1,
          lessonsRead: 0,
          streak: profile.current_streak,
          level: getLevelInfo(profile.xp + xp).level,
          dailyCardCount: 1,
          dailyGoal: profile.daily_goal,
        });
      }
    } else {
      setCardIndex((i) => i + 1);
    }
  }

  if (!userId || contentLoading) return <HomeSkeleton />;

  return (
    <div className="h-dvh bg-paper flex flex-col">
      <header className="bg-card border-b border-rule px-5 py-3.5 flex items-center gap-3 shrink-0">
        <button
          onClick={() => setSidebarOpen(true)}
          className="md:hidden p-1.5 -ml-1.5 rounded hover:bg-paper text-ink-2 transition-colors"
          aria-label="Open scope selector"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-serif text-lg font-semibold text-ink tracking-tight">Flashcards</h1>
          {scopeLabel ? (
            <p className="font-sans text-xs text-ink-2 mt-0.5 truncate">{scopeLabel}</p>
          ) : (
            <p className="font-sans text-xs text-ink-2 mt-0.5">Leitner spaced repetition</p>
          )}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          modules={modulesWithLessons}
          lpMap={lpMap}
          activeLessonId={scope.type === 'lesson' ? scope.id : null}
          activeModuleId={scope.type === 'module' ? scope.id : null}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          getLessonHref={(l) => `/flashcards?lesson=${l.id}`}
          getModuleHref={(m) => `/flashcards?module=${m.id}`}
          allHref="/flashcards"
        />

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-lg mx-auto px-5 py-6 pb-24 space-y-5">
            {/* Meta row */}
            <div className="flex items-center gap-3 font-sans text-xs text-ink-2">
              <span className="text-accent font-medium tabular-nums">{dueCards.length} due today</span>
              <span className="text-rule">·</span>
              <span className="tabular-nums">{filteredCards.length} total</span>
              <span className="text-rule">·</span>
              <span className="tabular-nums">{totalReviewed} ever reviewed</span>
            </div>

            {allFlashcards.length === 0 ? (
              <EmptyState />
            ) : sessionCards.length === 0 ? (
              <div className="space-y-3">
                {dueCards.length > 0 ? (
                  <div className="border border-rule rounded-md bg-card p-6 space-y-4">
                    <div>
                      <h2 className="font-serif text-xl font-semibold text-ink">
                        {dueCards.length} card{dueCards.length !== 1 ? 's' : ''} due
                      </h2>
                      <p className="font-sans text-sm text-ink-2 mt-1">Ready for today's review?</p>
                    </div>
                    <div className="space-y-2">
                      <button
                        onClick={() => startSession(false)}
                        className="w-full py-2.5 rounded-md bg-accent text-card font-sans text-sm font-medium hover:opacity-90 transition-opacity duration-150 active:scale-[0.99]"
                      >
                        Start Review Session
                      </button>
                      <button
                        onClick={() => startSession(true)}
                        className="w-full py-2.5 rounded-md border border-rule font-sans text-sm font-medium text-ink-2 hover:border-ink-2 hover:text-ink transition-colors duration-150"
                      >
                        Practice All {filteredCards.length} Cards
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="border border-rule rounded-md bg-card p-6 space-y-3">
                    <h2 className="font-serif text-xl font-semibold text-ink">All caught up</h2>
                    <p className="font-sans text-sm text-ink-2 leading-relaxed">
                      No cards are due right now. Come back later, or practice all cards to keep the material fresh.
                    </p>
                    <button
                      onClick={() => startSession(true)}
                      className="w-full py-2.5 rounded-md border border-rule font-sans text-sm font-medium text-ink-2 hover:border-ink-2 hover:text-ink transition-colors duration-150"
                    >
                      Practice All {filteredCards.length} Cards
                    </button>
                  </div>
                )}
              </div>
            ) : sessionDone ? (
              <div className="border border-rule rounded-md bg-card p-6 space-y-5">
                <div>
                  <h2 className="font-serif text-xl font-semibold text-ink">
                    {stats.incorrect === 0 ? 'Perfect session' : 'Session complete'}
                  </h2>
                  <p className="font-sans text-sm text-ink-2 mt-1 tabular-nums">
                    {stats.correct} correct · {stats.incorrect} to review
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-md border border-rule p-3 bg-correct">
                    <div className="font-sans tabular-nums text-2xl font-semibold text-sage">{stats.correct}</div>
                    <div className="font-sans text-xs text-ink-2 mt-0.5">Got it</div>
                  </div>
                  <div className="rounded-md border border-rule p-3 bg-wrong">
                    <div className="font-sans tabular-nums text-2xl font-semibold text-accent">{stats.incorrect}</div>
                    <div className="font-sans text-xs text-ink-2 mt-0.5">Review again</div>
                  </div>
                </div>

                <p className="font-sans text-xs text-ink-2 tabular-nums">
                  +{(stats.correct * (XP_CARD_REVIEW + XP_CARD_CORRECT_BONUS)) + (stats.incorrect * XP_CARD_REVIEW)} XP earned
                </p>

                <div className="flex gap-3">
                  <button
                    onClick={() => startSession(showAllCards)}
                    className="flex-1 py-2.5 rounded-md bg-accent text-card font-sans text-sm font-medium hover:opacity-90 transition-opacity"
                  >
                    Study Again
                  </button>
                  <button
                    onClick={() => setSessionCards([])}
                    className="flex-1 py-2.5 rounded-md border border-rule font-sans text-sm font-medium text-ink-2 hover:border-ink-2 hover:text-ink transition-colors"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <FlashCard
                card={currentCard}
                progress={progressMap.get(currentCard.id)}
                onGotIt={() => handleAnswer(true)}
                onReviewAgain={() => handleAnswer(false)}
                cardNum={cardIndex + 1}
                total={sessionCards.length}
              />
            )}

            {/* Leitner legend */}
            <div className="pt-2 border-t border-rule">
              <div className="flex items-center gap-4 flex-wrap">
                <span className="font-sans text-[11px] text-ink-2 font-medium">Box schedule:</span>
                {[
                  { b: 1, label: 'Daily' },
                  { b: 2, label: '+1 day' },
                  { b: 3, label: '+3 days' },
                  { b: 4, label: '+7 days' },
                  { b: 5, label: '+14 days' },
                ].map(({ b, label }) => (
                  <div key={b} className="flex items-center gap-1">
                    <div className={`w-3 h-0.75 rounded-sm ${b === 1 ? 'bg-accent' : 'bg-rule'}`} />
                    <span className="font-sans text-[11px] text-ink-2 tabular-nums">{b}  {label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>

      <AchievementToast achievementIds={newlyUnlocked} onDismiss={clearNewlyUnlocked} />
      <BottomNav />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="border border-rule rounded-md bg-card p-6 text-center space-y-3">
      <p className="font-serif text-xl font-semibold text-ink">No flashcards yet</p>
      <p className="font-sans text-sm text-ink-2 leading-relaxed">
        Add a lesson and AI will generate flashcards automatically.
      </p>
      <a
        href="/add-lesson"
        className="inline-block mt-2 px-5 py-2.5 rounded-md bg-accent text-card font-sans text-sm font-medium hover:opacity-90 transition-opacity"
      >
        Add First Lesson
      </a>
    </div>
  );
}
