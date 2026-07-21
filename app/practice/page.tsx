'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { BottomNav } from '@/components/BottomNav';
import { Sidebar } from '@/components/Sidebar';
import { AchievementToast } from '@/components/AchievementToast';
import { HomeSkeleton } from '@/components/Skeleton';
import { useProfile } from '@/hooks/useProfile';
import { useAchievements } from '@/hooks/useAchievements';
import { shuffle } from '@/lib/leitner';
import { XP_QUESTION_ANSWERED, XP_QUESTION_CORRECT_BONUS, getLevelInfo } from '@/lib/gamification';
import * as db from '@/lib/db';
import type { ModuleWithSections } from '@/components/Sidebar';
import type { UserSection, UserLesson, UserQuizQuestion, LessonProgress } from '@/lib/db-types';
import { scopeFromParams, lessonLabel, sectionLabel } from '@/lib/db-types';

export default function PracticePage() {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <PracticeContent />
    </Suspense>
  );
}

type QuizState = 'idle' | 'active' | 'answered' | 'done';

function PracticeContent() {
  const searchParams = useSearchParams();
  const lessonParam = searchParams.get('lesson');
  const sectionParam = searchParams.get('section');
  const moduleParam = searchParams.get('module');
  const scope = scopeFromParams(lessonParam, sectionParam, moduleParam);
  const scopeKey = lessonParam ?? sectionParam ?? moduleParam ?? 'all';

  const supabase = useMemo(() => createClient(), []);

  const [userId, setUserId] = useState<string | null>(null);
  const [modulesWithSections, setModulesWithSections] = useState<ModuleWithSections[]>([]);
  const [allSections, setAllSections] = useState<UserSection[]>([]);
  const [allLessons, setAllLessons] = useState<UserLesson[]>([]);
  const [allQuestions, setAllQuestions] = useState<UserQuizQuestion[]>([]);
  const [lpMap, setLpMap] = useState<Map<string, LessonProgress>>(new Map());
  const [contentLoading, setContentLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [questions, setQuestions] = useState<UserQuizQuestion[]>([]);
  const [qIndex, setQIndex] = useState(0);
  const [chosenIndex, setChosenIndex] = useState<number | null>(null);
  const [quizState, setQuizState] = useState<QuizState>('idle');
  const [score, setScore] = useState(0);

  const { profile, awardXP } = useProfile(userId ?? undefined);
  const { newlyUnlocked, checkAndAward, clearNewlyUnlocked } = useAchievements(userId ?? undefined);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      setUserId(user.id);
      const [mods, secs, lessons, qs, lpRows] = await Promise.all([
        db.getUserModules(supabase, user.id),
        db.getUserSections(supabase, user.id),
        db.getUserLessons(supabase, user.id),
        db.getUserQuizQuestions(supabase, user.id),
        db.getLessonProgress(supabase, user.id),
      ]);
      setAllSections(secs);
      setAllLessons(lessons);
      setAllQuestions(qs);
      setLpMap(new Map(lpRows.map((r) => [r.lesson_id, r])));
      setModulesWithSections(mods.map((m) => ({
        ...m,
        sections: secs
          .filter((s) => s.module_id === m.id)
          .map((s) => ({ ...s, lessons: lessons.filter((l) => l.section_id === s.id) })),
      })));
      setContentLoading(false);
    });
  }, [supabase]);

  // Reset quiz when scope changes
  useEffect(() => {
    setQuizState('idle');
    setQuestions([]);
  }, [scopeKey]);

  const filteredQuestions = useMemo(() => {
    if (scope.type === 'module') {
      const ids = new Set(allLessons.filter((l) => l.module_id === scope.id).map((l) => l.id));
      return allQuestions.filter((q) => q.lesson_id != null && ids.has(q.lesson_id));
    }
    if (scope.type === 'section') {
      const ids = new Set(allLessons.filter((l) => l.section_id === scope.id).map((l) => l.id));
      return allQuestions.filter((q) => q.lesson_id != null && ids.has(q.lesson_id));
    }
    if (scope.type === 'lesson') return allQuestions.filter((q) => q.lesson_id === scope.id);
    return allQuestions;
  }, [scope, allQuestions, allLessons]);

  const scopeLabel = useMemo(() => {
    if (scope.type === 'module') {
      const m = modulesWithSections.find((m) => m.id === scope.id);
      return m?.title ?? null;
    }
    if (scope.type === 'section') {
      const s = allSections.find((s) => s.id === scope.id);
      return s ? sectionLabel(s) : null;
    }
    if (scope.type === 'lesson') {
      const l = allLessons.find((l) => l.id === scope.id);
      return l ? lessonLabel(l) : null;
    }
    return null;
  }, [scope, modulesWithSections, allSections, allLessons]);

  function startQuiz() {
    setQuestions(shuffle(filteredQuestions));
    setQIndex(0);
    setChosenIndex(null);
    setScore(0);
    setQuizState('active');
  }

  const currentQ = questions[qIndex];
  const isCorrect = chosenIndex !== null && chosenIndex === currentQ?.correct_index;

  async function handleAnswer(idx: number) {
    if (quizState !== 'active' || !currentQ || !userId) return;
    setChosenIndex(idx);
    setQuizState('answered');
    const correct = idx === currentQ.correct_index;
    const xp = XP_QUESTION_ANSWERED + (correct ? XP_QUESTION_CORRECT_BONUS : 0);
    if (correct) setScore((s) => s + 1);
    db.addQuizAttempt(supabase, userId, { question_id: currentQ.id, chosen_index: idx, is_correct: correct });
    awardXP(xp);
  }

  async function handleNext() {
    if (qIndex + 1 >= questions.length) {
      setQuizState('done');
      if (profile && userId) {
        await checkAndAward({
          totalCardsEverReviewed: 0,
          quizScore: score,
          quizTotal: questions.length,
          lessonsRead: 0,
          streak: profile.current_streak,
          level: getLevelInfo(profile.xp).level,
          dailyCardCount: 0,
          dailyGoal: profile.daily_goal,
        });
      }
    } else {
      setQIndex((i) => i + 1);
      setChosenIndex(null);
      setQuizState('active');
    }
  }

  if (!userId || contentLoading) return <HomeSkeleton />;

  const accuracy = questions.length > 0 ? Math.round((score / questions.length) * 100) : 0;

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
          <h1 className="font-serif text-lg font-semibold text-ink tracking-tight">Practice Quiz</h1>
          {scopeLabel ? (
            <p className="font-sans text-xs text-ink-2 mt-0.5 truncate">{scopeLabel}</p>
          ) : (
            <p className="font-sans text-xs text-ink-2 mt-0.5">Multiple choice with explanations</p>
          )}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          modules={modulesWithSections}
          lpMap={lpMap}
          activeLessonId={scope.type === 'lesson' ? scope.id : null}
          activeSectionId={scope.type === 'section' ? scope.id : null}
          activeModuleId={scope.type === 'module' ? scope.id : null}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          getLessonHref={(l) => `/practice?lesson=${l.id}`}
          getSectionHref={(s) => `/practice?section=${s.id}`}
          getModuleHref={(m) => `/practice?module=${m.id}`}
          allHref="/practice"
        />

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-lg mx-auto px-5 py-6 pb-24 space-y-5">

            {allQuestions.length === 0 ? (
              <EmptyState />
            ) : quizState === 'idle' ? (
              <div className="border border-rule rounded-md bg-card p-6 space-y-4">
                <div>
                  <h2 className="font-serif text-xl font-semibold text-ink">
                    {filteredQuestions.length} question{filteredQuestions.length !== 1 ? 's' : ''}
                  </h2>
                  <p className="font-sans text-sm text-ink-2 mt-1 leading-relaxed">
                    Answer each question, then see the correct answer and explanation.
                  </p>
                </div>
                <button
                  onClick={startQuiz}
                  disabled={filteredQuestions.length === 0}
                  className="w-full py-2.5 rounded-md bg-accent text-card font-sans text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-opacity duration-150 active:scale-[0.99]"
                >
                  Begin Quiz
                </button>
              </div>
            ) : (quizState === 'active' || quizState === 'answered') && currentQ ? (
              <div className="space-y-4">
                {/* Progress */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between font-sans text-xs text-ink-2">
                    <span className="tabular-nums">Question {qIndex + 1} of {questions.length}</span>
                    <span className="tabular-nums text-sage font-medium">{score} correct</span>
                  </div>
                  <div className="h-0.75 rounded-sm bg-rule">
                    <div
                      className="h-full bg-accent/50 transition-all duration-300"
                      style={{ width: `${(qIndex / questions.length) * 100}%` }}
                    />
                  </div>
                </div>

                {/* Question */}
                <div className="border border-rule rounded-md bg-card p-5">
                  <p className="font-serif text-base text-ink leading-relaxed">{currentQ.prompt}</p>
                </div>

                {/* Choices */}
                <div className="space-y-2">
                  {currentQ.choices.map((choice, idx) => {
                    const answered = quizState === 'answered';
                    const isCorrectChoice = idx === currentQ.correct_index;
                    const isChosen = idx === chosenIndex;

                    let cls = 'border-rule bg-card text-ink';
                    if (answered) {
                      if (isCorrectChoice) cls = 'border-sage bg-correct text-ink';
                      else if (isChosen) cls = 'border-accent/60 bg-wrong text-ink';
                      else cls = 'border-rule bg-card text-ink-2 opacity-50';
                    }

                    return (
                      <button
                        key={idx}
                        onClick={() => handleAnswer(idx)}
                        disabled={answered}
                        className={`w-full text-left px-4 py-3 rounded-md border font-sans text-sm leading-snug transition-colors duration-150 ${cls} ${
                          !answered ? 'hover:border-ink-2 active:scale-[0.99]' : ''
                        }`}
                      >
                        <span className="text-ink-2 mr-2 tabular-nums">{String.fromCharCode(65 + idx)}.</span>
                        {choice}
                        {answered && isCorrectChoice && (
                          <span className="ml-2 text-sage text-xs font-medium">✓</span>
                        )}
                        {answered && isChosen && !isCorrectChoice && (
                          <span className="ml-2 text-accent text-xs font-medium">✗</span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Explanation */}
                {quizState === 'answered' && (
                  <div className="border-l-[3px] border-accent bg-accent-soft px-4 py-3 rounded-r-md">
                    <p className="font-sans text-xs font-semibold uppercase tracking-wider text-accent mb-1.5">
                      {isCorrect ? 'Correct' : 'Incorrect'}
                    </p>
                    <p className="font-sans text-sm text-ink leading-relaxed">{currentQ.explanation}</p>
                  </div>
                )}

                {quizState === 'answered' && (
                  <button
                    onClick={handleNext}
                    className="w-full py-2.5 rounded-md bg-accent text-card font-sans text-sm font-medium hover:opacity-90 transition-opacity duration-150 active:scale-[0.99]"
                  >
                    {qIndex + 1 >= questions.length ? 'See Results' : 'Next Question →'}
                  </button>
                )}
              </div>
            ) : quizState === 'done' ? (
              <div className="border border-rule rounded-md bg-card p-6 space-y-5">
                <div>
                  <h2 className="font-serif text-2xl font-semibold text-ink tabular-nums">{accuracy}%</h2>
                  <p className="font-sans text-sm text-ink-2 mt-1 tabular-nums">
                    {score} of {questions.length} correct
                  </p>
                </div>

                <div className="h-0.75 rounded-sm bg-rule">
                  <div
                    className="h-full bg-sage transition-all duration-700"
                    style={{ width: `${accuracy}%` }}
                  />
                </div>

                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-md border border-rule p-3 bg-correct">
                    <div className="font-sans tabular-nums text-xl font-semibold text-sage">{score}</div>
                    <div className="font-sans text-[11px] text-ink-2 mt-0.5">Correct</div>
                  </div>
                  <div className="rounded-md border border-rule p-3 bg-wrong">
                    <div className="font-sans tabular-nums text-xl font-semibold text-accent">{questions.length - score}</div>
                    <div className="font-sans text-[11px] text-ink-2 mt-0.5">Wrong</div>
                  </div>
                  <div className="rounded-md border border-rule p-3">
                    <div className="font-sans tabular-nums text-xl font-semibold text-ink">
                      +{score * (XP_QUESTION_ANSWERED + XP_QUESTION_CORRECT_BONUS) + (questions.length - score) * XP_QUESTION_ANSWERED}
                    </div>
                    <div className="font-sans text-[11px] text-ink-2 mt-0.5">XP</div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={startQuiz}
                    className="flex-1 py-2.5 rounded-md bg-accent text-card font-sans text-sm font-medium hover:opacity-90 transition-opacity"
                  >
                    Try Again
                  </button>
                  <button
                    onClick={() => setQuizState('idle')}
                    className="flex-1 py-2.5 rounded-md border border-rule font-sans text-sm font-medium text-ink-2 hover:border-ink-2 hover:text-ink transition-colors"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : null}
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
      <p className="font-serif text-xl font-semibold text-ink">No quiz questions yet</p>
      <p className="font-sans text-sm text-ink-2 leading-relaxed">
        Add a lesson and AI will generate exam-style questions automatically.
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
