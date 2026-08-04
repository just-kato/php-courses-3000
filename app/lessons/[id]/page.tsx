'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import { BottomNav } from '@/components/BottomNav';
import * as db from '@/lib/db';
import type { TextbookChunk } from '@/lib/db';
import { scheduleCard, filterDue } from '@/lib/srs';
import { lessonStatus } from '@/lib/db-types';
import type { Lesson, Section, Flashcard, Question, QuestionType } from '@/lib/db-types';

type Tab = 'source' | 'why' | 'cards' | 'practice';

const TYPE_LABEL: Record<QuestionType, string> = {
  factual: 'Factual',
  scenario: 'Scenario',
  calculation: 'Calculation',
};

const TYPE_CLASS: Record<QuestionType, string> = {
  factual: 'text-ink-2 border-rule bg-paper',
  scenario: 'text-ink border-rule bg-paper',
  calculation: 'text-accent-deep border-accent/30 bg-accent-soft',
};

// ── Source renderer ─────────────────────────────────────────────────────────

type ParsedBlock =
  | { type: 'heading'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'paragraph'; text: string };

function parseSource(text: string): ParsedBlock[] {
  const sections = text.split(/\n{2,}/);
  const blocks: ParsedBlock[] = [];
  const bulletRe = /^[-•*]\s|^\d+[.)]\s/;

  for (const section of sections) {
    const lines = section.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;

    if (lines.length === 1 && lines[0].length <= 80 && lines[0].endsWith(':')) {
      blocks.push({ type: 'heading', text: lines[0] });
      continue;
    }

    const bulletLines = lines.filter((l) => bulletRe.test(l));
    if (bulletLines.length >= 2 && bulletLines.length / lines.length >= 0.5) {
      blocks.push({ type: 'list', items: lines.map((l) => l.replace(/^[-•*]\s*|^\d+[.)]\s*/, '')) });
      continue;
    }

    blocks.push({ type: 'paragraph', text: lines.join(' ') });
  }

  return blocks;
}

function RenderedBlock({ block }: { block: ParsedBlock }) {
  if (block.type === 'heading') {
    return (
      <p className="font-sans text-[13px] font-medium text-accent-deep tracking-wide mt-2">
        {block.text}
      </p>
    );
  }
  if (block.type === 'list') {
    return (
      <ul className="list-disc list-outside pl-5 space-y-1">
        {block.items.map((item, i) => (
          <li key={i} className="font-sans text-[15px] leading-[1.7] text-ink-body">{item}</li>
        ))}
      </ul>
    );
  }
  return (
    <p className="font-sans text-[15px] leading-[1.7] text-ink-body">{block.text}</p>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function LessonPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  // Handle legacy ?tab=flashcards links
  const rawTab = searchParams.get('tab');
  const initialTab = ((rawTab === 'flashcards' ? 'cards' : rawTab) as Tab) ?? 'source';
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

  // Textbook search state
  const [textbookOpen, setTextbookOpen] = useState(false);
  const [textbookQuery, setTextbookQuery] = useState('');
  const [textbookResults, setTextbookResults] = useState<TextbookChunk[]>([]);
  const [textbookLoading, setTextbookLoading] = useState(false);

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
      setReviewQueue(filterDue(cardsData));
      setReviewIdx(0);
      setLoading(false);

      if (lessonStatus(lessonData) === 'generating') {
        const channel = supabase
          .channel(`lesson-gen-${lessonData.id}`)
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'lessons', filter: `id=eq.${lessonData.id}` },
            async (payload) => {
              if (!(payload.new as Lesson).generated_at) return;
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
        timeoutRef.current = setTimeout(() => { cleanup(); setGenerationError(true); }, 3 * 60 * 1000);
      }
    });

    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, router, id]);

  // ── Textbook search ──────────────────────────────────────────────────────

  async function openTextbookSearch() {
    const query = lesson?.title ?? '';
    setTextbookQuery(query);
    setTextbookOpen(true);
    if (query) {
      setTextbookLoading(true);
      const results = await db.searchTextbook(supabase, query);
      setTextbookResults(results);
      setTextbookLoading(false);
    }
  }

  async function runTextbookSearch() {
    if (!textbookQuery.trim()) return;
    setTextbookLoading(true);
    const results = await db.searchTextbook(supabase, textbookQuery);
    setTextbookResults(results);
    setTextbookLoading(false);
  }

  // ── Flashcard review handlers ───────────────────────────────────────────

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

  // ── Practice handlers ────────────────────────────────────────────────────

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

  // ── Loading skeleton ─────────────────────────────────────────────────────

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
  const dueCount = filterDue(cards).length;
  const filteredQuestions =
    typeFilter === 'all' ? questions : questions.filter((q) => q.question_type === typeFilter);
  const practiceAnswered = Object.keys(chosen).length;
  const practiceCorrect = Object.entries(chosen).filter(([qid, ci]) => {
    const q = questions.find((q) => q.id === qid);
    return q?.correct_index === ci;
  }).length;

  return (
    <div className="min-h-dvh bg-paper pb-28">

      {/* ── Header ── */}
      <header className="bg-card border-b border-rule px-5 py-3.5">
        {section && (
          <div className="mb-1.5">
            <Link
              href={`/sections/${section.slug}`}
              className="font-sans text-[12px] text-accent hover:text-accent-deep transition-colors"
            >
              ← {section.name} · {Math.round(section.exam_weight * 100)}% of exam
            </Link>
          </div>
        )}
        <h1 className="font-serif text-[21px] font-medium text-ink leading-snug">
          {lesson.title}
        </h1>
        <p className="font-sans text-[12px] text-ink-2 mt-1">
          {cards.length} cards · {questions.length} questions
          {dueCount > 0 && (
            <> · <span className="text-accent font-medium">{dueCount} due</span></>
          )}
        </p>
      </header>

      {/* ── Tabs ── */}
      <div className="bg-card border-b border-rule">
        <div className="max-w-lg mx-auto flex">
          {(['source', 'why', 'cards', 'practice'] as Tab[]).map((t) => {
            const label =
              t === 'cards' ? 'Cards' :
              t === 'why' ? 'Why' :
              t === 'source' ? 'Source' : 'Practice';
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-2.5 font-sans text-[13px] font-medium flex items-center justify-center gap-1.5 transition-colors border-b-2 ${
                  tab === t
                    ? 'text-accent-deep border-accent'
                    : 'text-ink-2 border-transparent hover:text-ink'
                }`}
              >
                {label}
                {t === 'cards' && cards.length > 0 && (
                  <span
                    className="font-sans text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                    style={{ background: 'var(--pill-bg)', color: 'var(--accent-deep)' }}
                  >
                    {cards.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Tab content ── */}
      <div className="max-w-lg mx-auto px-5 py-6">

        {/* ── Source tab ── */}
        {tab === 'source' && (
          <div>
            <div ref={sourceRef} className="space-y-3.5 selection:bg-accent/10">
              {parseSource(lesson.source_content).map((block, i) => (
                <RenderedBlock key={i} block={block} />
              ))}
            </div>

            {/* Textbook bar */}
            <div className="mt-8 rounded-lg bg-paper border border-rule px-4 py-3 flex items-center gap-3">
              <BookIcon className="w-4 h-4 text-ink-2 shrink-0" />
              <span className="font-sans text-[13px] text-ink-2 flex-1">Check this against the textbook</span>
              <button
                onClick={openTextbookSearch}
                className="font-sans text-[13px] font-medium text-accent hover:text-accent-deep transition-colors"
              >
                Search →
              </button>
            </div>

            {/* Textbook search panel */}
            {textbookOpen && (
              <div className="mt-3 space-y-3">
                <div className="flex gap-2">
                  <input
                    value={textbookQuery}
                    onChange={(e) => setTextbookQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && runTextbookSearch()}
                    placeholder="Search textbook…"
                    className="flex-1 px-3 py-2 rounded-md border border-rule bg-card font-sans text-[14px] text-ink placeholder:text-ink-2/50 focus:outline-none focus:border-ink-2 transition-colors"
                  />
                  <button
                    onClick={runTextbookSearch}
                    className="px-4 py-2 rounded-md bg-accent text-card font-sans text-[13px] font-medium hover:opacity-90 transition-opacity"
                  >
                    Go
                  </button>
                  <button
                    onClick={() => { setTextbookOpen(false); setTextbookResults([]); }}
                    className="px-3 py-2 rounded-md border border-rule font-sans text-[13px] text-ink-2 hover:text-ink transition-colors"
                  >
                    ✕
                  </button>
                </div>

                {textbookLoading && (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-16 animate-pulse rounded-md bg-rule opacity-40" />
                    ))}
                  </div>
                )}

                {!textbookLoading && textbookResults.length === 0 && textbookQuery && (
                  <p className="font-sans text-[13px] text-ink-2 text-center py-4">No results found.</p>
                )}

                {!textbookLoading && textbookResults.map((chunk) => (
                  <div key={chunk.id} className="rounded-md border border-rule bg-card px-4 py-3 space-y-1">
                    {chunk.heading && (
                      <p className="font-sans text-[11px] font-medium text-accent-deep uppercase tracking-wide">
                        {chunk.heading}
                      </p>
                    )}
                    <p className="font-sans text-[14px] text-ink-body leading-relaxed">{chunk.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Why tab ── */}
        {tab === 'why' && (
          <div>
            {status === 'empty' || status === 'generating' ? (
              <div className="rounded-md border border-rule bg-card p-6 text-center space-y-3">
                {generationError ? (
                  <>
                    <p className="font-serif text-base font-medium text-ink">Generation stalled</p>
                    <p className="font-sans text-[14px] text-ink-2">Refresh the page in a moment to check if it finished.</p>
                  </>
                ) : status === 'generating' ? (
                  <>
                    <Spinner />
                    <p className="font-sans text-[14px] text-ink-2">Generating — check back in a moment.</p>
                  </>
                ) : (
                  <>
                    <p className="font-serif text-base font-medium text-ink">Not yet generated</p>
                    <p className="font-sans text-[14px] text-ink-2">Add source content and generate to see the explainer.</p>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-md border border-rule bg-callout px-5 py-4">
                  <p className="font-sans text-[11px] font-medium text-accent-deep uppercase tracking-wide mb-2">
                    Why this matters on the exam
                  </p>
                  <p className="font-sans text-[15px] text-ink-body leading-[1.7]">
                    {lesson.why_it_matters}
                  </p>
                </div>
                {!lesson.completed_at && (
                  <button
                    onClick={async () => {
                      await db.markLessonComplete(supabase, lesson.id);
                      setLesson((prev) => prev ? { ...prev, completed_at: new Date().toISOString() } : prev);
                    }}
                    className="w-full py-2.5 rounded-md border border-rule font-sans text-[14px] font-medium text-ink-2 hover:border-accent hover:text-accent transition-colors"
                  >
                    Mark as completed
                  </button>
                )}
                {lesson.completed_at && (
                  <p className="font-sans text-[12px] text-sage text-center">
                    Completed {new Date(lesson.completed_at).toLocaleDateString()}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Cards tab ── */}
        {tab === 'cards' && (
          <div>
            {cards.length === 0 ? (
              <NoContent status={status} type="cards" generationError={generationError} />
            ) : reviewDone || reviewQueue.length === 0 ? (
              <div className="rounded-md border border-rule bg-card p-6 space-y-4 text-center">
                <p className="font-serif text-xl font-medium text-ink">
                  {reviewQueue.length === 0 ? 'All caught up' : 'Session done'}
                </p>
                {sessionTotal > 0 && (
                  <p className="font-sans text-[14px] text-ink-2">
                    {sessionCorrect} / {sessionTotal} correct this session
                  </p>
                )}
                {reviewQueue.length === 0 && (
                  <p className="font-sans text-[14px] text-ink-2">
                    No cards due right now. Come back later or review all {cards.length}.
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
                    className="w-full py-2.5 rounded-md border border-rule font-sans text-[14px] text-ink-2 hover:border-ink-2 hover:text-ink transition-colors"
                  >
                    Review all {cards.length} cards
                  </button>
                  {reviewDone && filterDue(cards).length > 0 && (
                    <button
                      onClick={restartReview}
                      className="w-full py-2.5 rounded-md bg-accent text-card font-sans text-[14px] font-medium hover:opacity-90 transition-opacity"
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
                <div className="flex gap-2 flex-wrap">
                  {(['all', 'factual', 'scenario', 'calculation'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTypeFilter(t)}
                      className={`px-3 py-1 rounded-full border font-sans text-[11px] font-medium transition-colors ${
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
                  <p className="font-sans text-[12px] text-ink-2 tabular-nums">
                    {practiceCorrect}/{practiceAnswered} correct
                  </p>
                )}

                <div className="space-y-5">
                  {filteredQuestions.map((q, qi) => {
                    const isRevealed = !!revealed[q.id];
                    const chosenIdx = chosen[q.id];

                    return (
                      <div key={q.id} className="rounded-md border border-rule bg-card overflow-hidden">
                        <div className="px-4 pt-4 pb-3 border-b border-rule">
                          <div className="flex items-start gap-2.5 mb-2">
                            <span className="font-sans text-[11px] text-ink-2 tabular-nums shrink-0 mt-0.5">
                              {qi + 1}.
                            </span>
                            <span
                              className={`font-sans text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded border shrink-0 ${TYPE_CLASS[q.question_type]}`}
                            >
                              {TYPE_LABEL[q.question_type]}
                            </span>
                          </div>
                          <p className="font-sans text-[15px] text-ink leading-relaxed">{q.stem}</p>
                        </div>

                        <div className="divide-y divide-rule">
                          {q.options.map((opt, ci) => {
                            const isChosen = chosenIdx === ci;
                            const isCorrect = q.correct_index === ci;
                            let optClass = 'text-ink hover:bg-paper cursor-pointer';
                            if (isRevealed) {
                              if (isCorrect) optClass = 'bg-correct text-ink cursor-default';
                              else if (isChosen && !isCorrect) optClass = 'bg-wrong text-ink cursor-default';
                              else optClass = 'text-ink-2 cursor-default';
                            }
                            return (
                              <button
                                key={ci}
                                disabled={isRevealed}
                                onClick={() => handleAnswer(q, ci)}
                                className={`w-full text-left flex items-start gap-3 px-4 py-3 transition-colors font-sans text-[14px] ${optClass}`}
                              >
                                <span className="font-medium text-ink-2 shrink-0 tabular-nums w-4">
                                  {String.fromCharCode(65 + ci)}.
                                </span>
                                <span className="flex-1">{opt}</span>
                                {isRevealed && isCorrect && <span className="text-sage shrink-0">✓</span>}
                                {isRevealed && isChosen && !isCorrect && <span className="text-accent shrink-0">✗</span>}
                              </button>
                            );
                          })}
                        </div>

                        {isRevealed && (
                          <div className="px-4 pb-4 pt-3 border-t border-rule bg-callout space-y-2">
                            <p className="font-sans text-[13px] text-ink-body leading-relaxed">
                              {q.explanation}
                            </p>
                            {q.source_anchor && (
                              <button
                                onClick={() => scrollToAnchor(q.source_anchor)}
                                className="font-sans text-[12px] text-ink-2 hover:text-accent italic transition-colors text-left"
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

// ── Sub-components ──────────────────────────────────────────────────────────────

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
        <span className="font-sans text-[12px] text-ink-2 tabular-nums">{cardNum} of {total}</span>
        {card.lapses > 0 && (
          <span className="font-sans text-[11px] text-ink-2 tabular-nums">{card.lapses} lapses</span>
        )}
      </div>

      <button
        onClick={onFlip}
        className="w-full min-h-48 rounded-md border border-rule bg-card p-8 text-left cursor-pointer hover:bg-paper transition-colors"
      >
        <p className="font-sans text-[11px] font-medium text-ink-2 uppercase tracking-wide mb-4">
          {flipped ? 'Answer' : 'Description'}
        </p>
        <p className="font-serif text-ink text-lg leading-relaxed">
          {flipped ? card.back : card.front}
        </p>
        {!flipped && (
          <p className="font-sans text-[12px] text-ink-2/60 mt-6">Tap to reveal</p>
        )}
        {flipped && card.source_anchor && (
          <button
            onClick={(e) => { e.stopPropagation(); onAnchorClick(card.source_anchor); }}
            className="mt-4 font-sans text-[12px] text-ink-2 hover:text-accent italic transition-colors"
          >
            "{card.source_anchor.slice(0, 60)}…" →
          </button>
        )}
      </button>

      <div className={`flex gap-3 transition-all duration-150 ${flipped ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <button
          onClick={onWrong}
          className="flex-1 py-3 rounded-md border border-rule font-sans text-[14px] font-medium text-ink-2 hover:border-ink hover:text-ink transition-colors active:scale-[0.99]"
        >
          Again
        </button>
        <button
          onClick={onCorrect}
          className="flex-1 py-3 rounded-md bg-sage text-card font-sans text-[14px] font-medium hover:opacity-90 transition-opacity active:scale-[0.99]"
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
      <div className="rounded-md border border-rule bg-card p-6 text-center">
        <p className="font-serif text-base font-medium text-ink mb-2">No source content</p>
        <p className="font-sans text-[14px] text-ink-2">Add content via the Ingest page to generate {type}.</p>
      </div>
    );
  }
  if (status === 'generating') {
    if (generationError) {
      return (
        <div className="rounded-md border border-rule bg-card p-6 text-center space-y-2">
          <p className="font-sans text-[14px] text-ink">Generation is taking longer than expected.</p>
          <p className="font-sans text-[14px] text-ink-2">Refresh the page in a moment to check for {type}.</p>
        </div>
      );
    }
    return (
      <div className="rounded-md border border-rule bg-card p-6 text-center space-y-3">
        <Spinner />
        <p className="font-sans text-[14px] text-ink-2">Generating {type}…</p>
      </div>
    );
  }
  return (
    <div className="rounded-md border border-rule bg-card p-6 text-center">
      <p className="font-sans text-[14px] text-ink-2">No {type} found.</p>
    </div>
  );
}

function BookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
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
