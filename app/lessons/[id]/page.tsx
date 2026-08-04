'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import { BottomNav } from '@/components/BottomNav';
import * as db from '@/lib/db';
import { scheduleCard, filterDue } from '@/lib/srs';
import { lessonStatus, EXAM_SCORED_QUESTIONS } from '@/lib/db-types';
import type { Lesson, Section, Flashcard, Question, QuestionType } from '@/lib/db-types';

type Tab = 'source' | 'why' | 'flashcards' | 'practice';

const TYPE_LABEL: Record<QuestionType, string> = {
  factual: 'Factual',
  scenario: 'Scenario',
  calculation: 'Calculation',
};

const TYPE_CLASS: Record<QuestionType, string> = {
  factual: 'text-ink-2 border-rule',
  scenario: 'text-blue-600 border-blue-200 bg-blue-50',
  calculation: 'text-amber-600 border-amber-200 bg-amber-50',
};

export default function LessonPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const initialTab = (searchParams.get('tab') as Tab) ?? 'source';
  const [tab, setTab] = useState<Tab>(initialTab);

  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [section, setSection] = useState<Section | null>(null);
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [generationError, setGenerationError] = useState(false);

  // Flashcard review state
  const [reviewQueue, setReviewQueue] = useState<Flashcard[]>([]);
  const [reviewIdx, setReviewIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [sessionTotal, setSessionTotal] = useState(0);
  const [reviewDone, setReviewDone] = useState(false);

  // Practice state
  const [typeFilter, setTypeFilter] = useState<QuestionType | 'all'>('all');
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [chosen, setChosen] = useState<Record<string, number>>({});

  // Source anchor highlight ref
  const sourceRef = useRef<HTMLDivElement>(null);

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function cleanup() {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    }

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/sign-in'); return; }

      const [lessonData, cardsData, questionsData] = await Promise.all([
        db.getLessonById(supabase, id),
        db.getFlashcards(supabase, id),
        db.getQuestions(supabase, id),
      ]);

      if (!lessonData) { router.push('/'); return; }

      const sectionData = await db.getSectionBySlug(
        supabase,
        (await supabase.from('sections').select('slug').eq('id', lessonData.section_id).single()).data?.slug ?? ''
      );

      setLesson(lessonData);
      setSection(sectionData);
      setCards(cardsData);
      setQuestions(questionsData);

      const due = filterDue(cardsData);
      setReviewQueue(due);
      setReviewIdx(0);
      setLoading(false);

      // If still generating, subscribe so the UI reacts when generated_at is set
      if (lessonStatus(lessonData) === 'generating') {
        const channel = supabase
          .channel(`lesson-gen-${lessonData.id}`)
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'lessons', filter: `id=eq.${lessonData.id}` },
            async (payload) => {
              if (!(payload.new as Lesson).generated_at) return;

              // Fetch fresh data now that generation is complete
              const [freshLesson, freshCards, freshQuestions] = await Promise.all([
                db.getLessonById(supabase, id),
                db.getFlashcards(supabase, id),
                db.getQuestions(supabase, id),
              ]);

              if (freshLesson) setLesson(freshLesson);
              setCards(freshCards);
              setQuestions(freshQuestions);
              setReviewQueue(filterDue(freshCards));
              setReviewIdx(0);
              cleanup();
            }
          )
          .subscribe();

        channelRef.current = channel;

        // 3-minute timeout: surface the stall instead of spinning forever
        timeoutRef.current = setTimeout(() => {
          cleanup();
          setGenerationError(true);
        }, 3 * 60 * 1000);
      }
    });

    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, router, id]);

  // ── Flashcard review handlers ──────────────────────────────────────────────

  async function handleCardAnswer(correct: boolean) {
    const card = reviewQueue[reviewIdx];
    if (!card) return;

    const updates = scheduleCard(card, correct);
    await db.updateFlashcardSRS(supabase, card.id, {
      ease: updates.ease,
      interval_days: updates.interval_days,
      due_at: updates.due_at.toISOString(),
      lapses: updates.lapses,
    });

    setCards((prev) =>
      prev.map((c) =>
        c.id === card.id
          ? { ...c, ease: updates.ease, interval_days: updates.interval_days, due_at: updates.due_at.toISOString(), lapses: updates.lapses }
          : c
      )
    );

    if (correct) setSessionCorrect((n) => n + 1);
    setSessionTotal((n) => n + 1);

    const next = reviewIdx + 1;
    if (next >= reviewQueue.length) {
      setReviewDone(true);
    } else {
      setReviewIdx(next);
      setFlipped(false);
    }
  }

  function restartReview() {
    const due = filterDue(cards);
    setReviewQueue(due);
    setReviewIdx(0);
    setFlipped(false);
    setSessionCorrect(0);
    setSessionTotal(0);
    setReviewDone(false);
  }

  // ── Practice handlers ──────────────────────────────────────────────────────

  async function handleAnswer(question: Question, chosenIdx: number) {
    if (chosen[question.id] !== undefined) return;
    const correct = chosenIdx === question.correct_index;
    setChosen((prev) => ({ ...prev, [question.id]: chosenIdx }));
    setRevealed((prev) => ({ ...prev, [question.id]: true }));

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await db.recordAttempt(supabase, {
        question_id: question.id,
        user_id: user.id,
        chosen_index: chosenIdx,
        correct,
      });
    }
  }

  function scrollToAnchor(anchor: string | null) {
    if (!anchor || !sourceRef.current) return;
    const text = sourceRef.current.innerText;
    const idx = text.indexOf(anchor.slice(0, 30));
    if (idx === -1) return;
    setTab('source');
    setTimeout(() => {
      const range = document.createRange();
      const walker = document.createTreeWalker(sourceRef.current!, NodeFilter.SHOW_TEXT);
      let offset = 0;
      let node: Text | null = null;
      while (walker.nextNode()) {
        const n = walker.currentNode as Text;
        if (offset + n.length >= idx) { node = n; break; }
        offset += n.length;
      }
      if (node) {
        range.setStart(node, idx - offset);
        range.setEnd(node, Math.min(idx - offset + anchor.length, node.length));
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        node.parentElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  }

  if (loading || !lesson) {
    return (
      <div className="min-h-dvh bg-paper pb-28">
        <div className="max-w-lg mx-auto px-5 py-20 space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded bg-rule opacity-40" />
          ))}
        </div>
        <BottomNav />
      </div>
    );
  }

  const status = lessonStatus(lesson);
  const filteredQuestions =
    typeFilter === 'all' ? questions : questions.filter((q) => q.question_type === typeFilter);

  const practiceAnswered = Object.keys(chosen).length;
  const practiceCorrect = Object.entries(chosen).filter(([qid, ci]) => {
    const q = questions.find((q) => q.id === qid);
    return q?.correct_index === ci;
  }).length;

  return (
    <div className="min-h-dvh bg-paper pb-28">
      {/* Header */}
      <header className="bg-card border-b border-rule px-5 py-3.5">
        <div className="flex items-center gap-3 mb-2">
          {section && (
            <Link
              href={`/sections/${section.slug}`}
              className="font-sans text-xs text-ink-2 hover:text-ink transition-colors"
            >
              ← {section.name}
            </Link>
          )}
        </div>
        <h1 className="font-serif text-base font-semibold text-ink leading-snug">
          {lesson.title}
        </h1>
        <p className="font-sans text-[11px] text-ink-2 mt-0.5">
          {cards.length} cards · {questions.length} questions
          {filterDue(cards).length > 0 && ` · ${filterDue(cards).length} due`}
        </p>
      </header>

      {/* Tabs */}
      <div className="bg-card border-b border-rule">
        <div className="max-w-lg mx-auto flex">
          {(['source', 'why', 'flashcards', 'practice'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 font-sans text-xs font-medium capitalize tracking-wide transition-colors border-b-2 ${
                tab === t
                  ? 'text-accent border-accent'
                  : 'text-ink-2 border-transparent hover:text-ink'
              }`}
            >
              {t === 'why' ? 'Why' : t === 'flashcards' ? 'Cards' : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-5 py-6">

        {/* ── Source tab ── */}
        {tab === 'source' && (
          <div
            ref={sourceRef}
            className="font-sans text-sm text-ink leading-7 whitespace-pre-wrap selection:bg-accent/20"
            style={{ fontFamily: 'Georgia, Cambria, serif', fontSize: '0.9375rem', lineHeight: '1.85' }}
          >
            {lesson.source_content}
          </div>
        )}

        {/* ── Why tab ── */}
        {tab === 'why' && (
          <div>
            {status === 'empty' || status === 'generating' ? (
              <div className="border border-rule rounded-md bg-card p-6 text-center space-y-3">
                {generationError ? (
                  <>
                    <p className="font-serif text-base font-semibold text-ink">Generation stalled</p>
                    <p className="font-sans text-sm text-ink-2">
                      Refresh the page in a moment to check if it finished.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-serif text-base font-semibold text-ink">
                      {status === 'generating' ? 'Generating…' : 'Not yet generated'}
                    </p>
                    <p className="font-sans text-sm text-ink-2">
                      {status === 'generating'
                        ? 'Check back in a moment.'
                        : 'Add source content and generate to see the explainer.'}
                    </p>
                    {status === 'generating' && <Spinner />}
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="border border-rule rounded-md bg-card px-5 py-4">
                  <p className="font-sans text-xs font-semibold uppercase tracking-wider text-ink-2 mb-2">
                    Why This Matters on the Exam
                  </p>
                  <p className="font-sans text-sm text-ink leading-relaxed">
                    {lesson.why_it_matters}
                  </p>
                </div>
                {!lesson.completed_at && (
                  <button
                    onClick={async () => {
                      await db.markLessonComplete(supabase, lesson.id);
                      setLesson((prev) => prev ? { ...prev, completed_at: new Date().toISOString() } : prev);
                    }}
                    className="w-full py-2.5 rounded-md border border-rule font-sans text-sm font-medium text-ink-2 hover:border-sage hover:text-sage transition-colors"
                  >
                    Mark as Completed
                  </button>
                )}
                {lesson.completed_at && (
                  <p className="font-sans text-[11px] text-sage text-center">
                    Completed {new Date(lesson.completed_at).toLocaleDateString()}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Flashcards tab ── */}
        {tab === 'flashcards' && (
          <div>
            {cards.length === 0 ? (
              <NoContent status={status} type="cards" generationError={generationError} />
            ) : reviewDone || reviewQueue.length === 0 ? (
              <div className="border border-rule rounded-md bg-card p-6 space-y-4 text-center">
                <p className="font-serif text-xl font-semibold text-ink">
                  {reviewQueue.length === 0 ? 'All caught up' : 'Session done'}
                </p>
                {sessionTotal > 0 && (
                  <p className="font-sans text-sm text-ink-2">
                    {sessionCorrect} / {sessionTotal} correct this session
                  </p>
                )}
                {reviewQueue.length === 0 && (
                  <p className="font-sans text-sm text-ink-2">
                    No cards due right now. Come back later or review all {cards.length} cards.
                  </p>
                )}
                <div className="space-y-2 pt-2">
                  <button
                    onClick={() => {
                      setReviewQueue(cards);
                      setReviewIdx(0);
                      setFlipped(false);
                      setSessionCorrect(0);
                      setSessionTotal(0);
                      setReviewDone(false);
                    }}
                    className="w-full py-2.5 rounded-md border border-rule font-sans text-sm text-ink-2 hover:border-ink-2 hover:text-ink transition-colors"
                  >
                    Review all {cards.length} cards
                  </button>
                  {reviewDone && filterDue(cards).length > 0 && (
                    <button
                      onClick={restartReview}
                      className="w-full py-2.5 rounded-md bg-accent text-card font-sans text-sm font-medium hover:opacity-90 transition-opacity"
                    >
                      Review {filterDue(cards).length} due again
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <FlashcardReview
                card={reviewQueue[reviewIdx]}
                cardNum={reviewIdx + 1}
                total={reviewQueue.length}
                flipped={flipped}
                onFlip={() => setFlipped((f) => !f)}
                onCorrect={() => handleCardAnswer(true)}
                onWrong={() => handleCardAnswer(false)}
                onAnchorClick={scrollToAnchor}
              />
            )}
          </div>
        )}

        {/* ── Practice tab ── */}
        {tab === 'practice' && (
          <div className="space-y-5">
            {questions.length === 0 ? (
              <NoContent status={status} type="questions" generationError={generationError} />
            ) : (
              <>
                {/* Type filter */}
                <div className="flex gap-2 flex-wrap">
                  {(['all', 'factual', 'scenario', 'calculation'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTypeFilter(t)}
                      className={`px-3 py-1 rounded-full border font-sans text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                        typeFilter === t
                          ? 'bg-ink text-card border-ink'
                          : 'border-rule text-ink-2 hover:border-ink-2 hover:text-ink'
                      }`}
                    >
                      {t === 'all'
                        ? `All (${questions.length})`
                        : `${TYPE_LABEL[t]} (${questions.filter((q) => q.question_type === t).length})`}
                    </button>
                  ))}
                </div>

                {practiceAnswered > 0 && (
                  <p className="font-sans text-[11px] text-ink-2 tabular-nums">
                    {practiceCorrect}/{practiceAnswered} correct
                  </p>
                )}

                <div className="space-y-6">
                  {filteredQuestions.map((q, qi) => {
                    const isRevealed = !!revealed[q.id];
                    const chosenIdx = chosen[q.id];

                    return (
                      <div key={q.id} className="border border-rule rounded-md bg-card overflow-hidden">
                        {/* Question header */}
                        <div className="px-4 pt-4 pb-3 border-b border-rule">
                          <div className="flex items-start gap-3 mb-2">
                            <span className="font-sans text-[10px] font-semibold uppercase tracking-wider text-ink-2 tabular-nums shrink-0 mt-0.5">
                              {qi + 1}
                            </span>
                            <span
                              className={`font-sans text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0 ${TYPE_CLASS[q.question_type]}`}
                            >
                              {TYPE_LABEL[q.question_type]}
                            </span>
                          </div>
                          <p className="font-sans text-sm text-ink leading-relaxed">{q.stem}</p>
                        </div>

                        {/* Options */}
                        <div className="divide-y divide-rule">
                          {q.options.map((opt, ci) => {
                            const isChosen = chosenIdx === ci;
                            const isCorrect = q.correct_index === ci;
                            let optClass = 'text-ink hover:bg-paper cursor-pointer';
                            if (isRevealed) {
                              if (isCorrect) optClass = 'bg-sage/10 text-sage cursor-default';
                              else if (isChosen && !isCorrect) optClass = 'bg-wrong text-ink cursor-default';
                              else optClass = 'text-ink-2 cursor-default';
                            }

                            return (
                              <button
                                key={ci}
                                disabled={isRevealed}
                                onClick={() => handleAnswer(q, ci)}
                                className={`w-full text-left flex items-start gap-3 px-4 py-3 transition-colors font-sans text-sm ${optClass}`}
                              >
                                <span className="font-semibold text-ink-2 shrink-0 tabular-nums w-4">
                                  {String.fromCharCode(65 + ci)}.
                                </span>
                                <span className="flex-1">{opt}</span>
                                {isRevealed && isCorrect && (
                                  <span className="text-sage shrink-0">✓</span>
                                )}
                                {isRevealed && isChosen && !isCorrect && (
                                  <span className="text-accent shrink-0">✗</span>
                                )}
                              </button>
                            );
                          })}
                        </div>

                        {/* Explanation + source anchor */}
                        {isRevealed && (
                          <div className="px-4 pb-4 pt-3 border-t border-rule space-y-2 bg-paper">
                            <p className="font-sans text-xs text-ink leading-relaxed">
                              {q.explanation}
                            </p>
                            {q.source_anchor && (
                              <button
                                onClick={() => scrollToAnchor(q.source_anchor)}
                                className="font-sans text-[11px] text-ink-2 hover:text-accent italic leading-relaxed text-left transition-colors"
                              >
                                "{q.source_anchor}" →
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function FlashcardReview({
  card,
  cardNum,
  total,
  flipped,
  onFlip,
  onCorrect,
  onWrong,
  onAnchorClick,
}: {
  card: Flashcard;
  cardNum: number;
  total: number;
  flipped: boolean;
  onFlip: () => void;
  onCorrect: () => void;
  onWrong: () => void;
  onAnchorClick: (anchor: string | null) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="font-sans text-xs text-ink-2 tabular-nums">{cardNum} of {total}</span>
        {card.lapses > 0 && (
          <span className="font-sans text-[10px] text-ink-2 tabular-nums">{card.lapses} lapses</span>
        )}
      </div>

      <button
        onClick={onFlip}
        className="w-full min-h-48 border border-rule rounded-md bg-card p-8 text-left cursor-pointer hover:bg-paper transition-colors group"
      >
        <p className="font-sans text-[10px] font-semibold uppercase tracking-wider text-ink-2 mb-4">
          {flipped ? 'Answer' : 'Description'}
        </p>
        <p className="font-serif text-ink text-lg leading-relaxed">
          {flipped ? card.back : card.front}
        </p>
        {!flipped && (
          <p className="font-sans text-[11px] text-ink-2/60 mt-6">Tap to reveal</p>
        )}
        {flipped && card.source_anchor && (
          <button
            onClick={(e) => { e.stopPropagation(); onAnchorClick(card.source_anchor); }}
            className="mt-4 font-sans text-[11px] text-ink-2 hover:text-accent italic transition-colors"
          >
            "{card.source_anchor.slice(0, 60)}…" →
          </button>
        )}
      </button>

      <div
        className={`flex gap-3 transition-all duration-150 ${flipped ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      >
        <button
          onClick={onWrong}
          className="flex-1 py-3 rounded-md border border-rule font-sans text-sm font-medium text-ink-2 hover:border-ink hover:text-ink transition-colors active:scale-[0.99]"
        >
          Again
        </button>
        <button
          onClick={onCorrect}
          className="flex-1 py-3 rounded-md bg-sage text-card font-sans text-sm font-medium hover:opacity-90 transition-opacity active:scale-[0.99]"
        >
          Got it
        </button>
      </div>
    </div>
  );
}

function NoContent({
  status,
  type,
  generationError,
}: {
  status: ReturnType<typeof lessonStatus>;
  type: 'cards' | 'questions';
  generationError?: boolean;
}) {
  if (status === 'empty') {
    return (
      <div className="border border-rule rounded-md bg-card p-6 text-center">
        <p className="font-serif text-base font-semibold text-ink mb-2">No source content</p>
        <p className="font-sans text-sm text-ink-2">Add content via the Ingest page to generate {type}.</p>
      </div>
    );
  }
  if (status === 'generating') {
    if (generationError) {
      return (
        <div className="border border-rule rounded-md bg-card p-6 text-center space-y-2">
          <p className="font-sans text-sm text-ink">Generation is taking longer than expected.</p>
          <p className="font-sans text-sm text-ink-2">Refresh the page in a moment to check for {type}.</p>
        </div>
      );
    }
    return (
      <div className="border border-rule rounded-md bg-card p-6 text-center space-y-2">
        <Spinner />
        <p className="font-sans text-sm text-ink-2">Generating {type}…</p>
      </div>
    );
  }
  return (
    <div className="border border-rule rounded-md bg-card p-6 text-center">
      <p className="font-sans text-sm text-ink-2">No {type} found.</p>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="w-5 h-5 animate-spin text-ink-2 mx-auto" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
