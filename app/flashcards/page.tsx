'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { BottomNav } from '@/components/BottomNav';
import { FlashCard } from '@/components/FlashCard';
import { AchievementToast } from '@/components/AchievementToast';
import { HomeSkeleton } from '@/components/Skeleton';
import { useProfile } from '@/hooks/useProfile';
import { useFlashcardProgress } from '@/hooks/useFlashcardProgress';
import { useAchievements } from '@/hooks/useAchievements';
import { filterDueCards, shuffle } from '@/lib/leitner';
import { XP_CARD_REVIEW, XP_CARD_CORRECT_BONUS, getLevelInfo } from '@/lib/gamification';
import * as db from '@/lib/db';
import type { UserModule, UserFlashcard } from '@/lib/db-types';

export default function FlashcardsPage() {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <FlashcardsContent />
    </Suspense>
  );
}

function FlashcardsContent() {
  const searchParams = useSearchParams();
  const initModule = searchParams.get('module') ?? 'all';
  const supabase = useMemo(() => createClient(), []);

  const [userId, setUserId] = useState<string | null>(null);
  const [userModules, setUserModules] = useState<UserModule[]>([]);
  const [allFlashcards, setAllFlashcards] = useState<UserFlashcard[]>([]);
  const [contentLoading, setContentLoading] = useState(true);

  const [selectedModule, setSelectedModule] = useState(initModule);
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
      const [mods, cards] = await Promise.all([
        db.getUserModules(supabase, user.id),
        db.getUserFlashcards(supabase, user.id),
      ]);
      setUserModules(mods);
      setAllFlashcards(cards);
      setContentLoading(false);
    });
  }, [supabase]);

  const filteredCards = useMemo(() =>
    selectedModule === 'all'
      ? allFlashcards
      : allFlashcards.filter((c) => c.module_id === selectedModule),
    [selectedModule, allFlashcards]
  );

  const dueCards = useMemo(() => {
    if (progressMap.size === 0 && filteredCards.length > 0) return filteredCards;
    return filterDueCards(filteredCards, progressMap);
  }, [filteredCards, progressMap]);

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

  const tabs = [
    { id: 'all', title: 'All' },
    ...userModules.map((m) => ({ id: m.id, title: m.title })),
  ];

  return (
    <div className="min-h-dvh bg-paper pb-24">
      <header className="bg-card border-b border-rule px-5 py-3.5">
        <h1 className="font-serif text-lg font-semibold text-ink tracking-tight">Flashcards</h1>
        <p className="font-sans text-xs text-ink-2 mt-0.5">Leitner spaced repetition</p>
      </header>

      {/* Module tabs */}
      <div className="bg-card border-b border-rule px-5 flex gap-0 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => { setSelectedModule(t.id); setSessionCards([]); setSessionDone(false); }}
            className={`shrink-0 py-2.5 px-3 font-sans text-xs font-medium border-b-2 transition-colors duration-150 ${
              selectedModule === t.id
                ? 'border-accent text-accent'
                : 'border-transparent text-ink-2 hover:text-ink'
            }`}
          >
            {t.title}
          </button>
        ))}
      </div>

      <div className="max-w-lg mx-auto px-5 py-6 space-y-5">
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
