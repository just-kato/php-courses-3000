'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, BookOpen } from '@phosphor-icons/react';
import { createClient } from '@/utils/supabase/client';
import { AppNav } from '@/components/AppNav';
import * as db from '@/lib/db';
import type { TextbookChunk } from '@/lib/db';
import { scheduleCard, filterDue } from '@/lib/srs';
import { lessonStatus } from '@/lib/db-types';
import type { Lesson, Section, Flashcard, Question, QuestionType } from '@/lib/db-types';

type Tab = 'study' | 'source' | 'cards' | 'practice';

const TYPE_LABEL: Record<QuestionType, string> = {
  factual: 'Factual',
  scenario: 'Scenario',
  calculation: 'Calc',
};

// ── Source parser ─────────────────────────────────────────────────────────────

type Block =
  | { type: 'heading'; text: string }
  | { type: 'sub'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'note'; text: string }
  | { type: 'paragraph'; text: string };

function parseSource(text: string): Block[] {
  const sections = text.split(/\n{2,}/);
  const blocks: Block[] = [];
  const bulletRe = /^[-•*]\s|^\d+[.)]\s/;

  for (const section of sections) {
    const lines = section.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;

    if (lines.length === 1 && lines[0].length <= 80 && lines[0].endsWith(':')) {
      blocks.push({ type: 'heading', text: lines[0] });
      continue;
    }

    if (lines.length === 1 && lines[0].length <= 60 && !bulletRe.test(lines[0])) {
      blocks.push({ type: 'sub', text: lines[0] });
      continue;
    }

    if (lines[0].toLowerCase().startsWith('note:') || lines[0].toLowerCase().startsWith('important:')) {
      blocks.push({ type: 'note', text: lines.join(' ') });
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

// ── Main component ─────────────────────────────────────────────────────────────

export default function LessonPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const rawTab = searchParams.get('tab');
  const initialTab: Tab =
    rawTab === 'flashcards' || rawTab === 'cards' ? 'cards' :
    rawTab === 'practice' ? 'practice' :
    rawTab === 'source' ? 'source' : 'study';

  const [tab, setTab] = useState<Tab>(initialTab);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [section, setSection] = useState<Section | null>(null);
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [generationError, setGenerationError] = useState(false);

  // Cards state
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
      if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null; }
      if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
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
      setLoading(false);

      if (lessonStatus(lessonData) === 'generating') {
        const channel = supabase
          .channel(`lesson-gen-${lessonData.id}`)
          .on('postgres_changes',
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
              cleanup();
            }
          )
          .subscribe();
        channelRef.current = channel;
        timeoutRef.current = setTimeout(() => { cleanup(); setGenerationError(true); }, 3 * 60 * 1000);
      }
    });

    return () => {
      if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null; }
      if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, router, id]);

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
    setCards((prev) => prev.map((c) =>
      c.id === card.id ? { ...c, ease: updates.ease, interval_days: updates.interval_days, due_at: updates.due_at.toISOString(), lapses: updates.lapses } : c
    ));
    if (correct) setSessionCorrect((n) => n + 1);
    setSessionTotal((n) => n + 1);
    const next = reviewIdx + 1;
    if (next >= reviewQueue.length) { setReviewDone(true); }
    else { setReviewIdx(next); setFlipped(false); }
  }

  async function handlePracticeAnswer(question: Question, chosenIdx: number) {
    if (chosen[question.id] !== undefined) return;
    const correct = chosenIdx === question.correct_index;
    setChosen((prev) => ({ ...prev, [question.id]: chosenIdx }));
    setRevealed((prev) => ({ ...prev, [question.id]: true }));
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await db.recordAttempt(supabase, { question_id: question.id, user_id: user.id, chosen_index: chosenIdx, correct });
    }
  }

  function scrollToAnchor(anchor: string | null) {
    if (!anchor || !sourceRef.current) return;
    const text = sourceRef.current.innerText;
    const idx = text.indexOf(anchor.slice(0, 30));
    if (idx === -1) return;
    setTab('source');
    setTimeout(() => {
      const walker = document.createTreeWalker(sourceRef.current!, NodeFilter.SHOW_TEXT);
      let offset = 0;
      while (walker.nextNode()) {
        const n = walker.currentNode as Text;
        if (offset + n.length >= idx) {
          const range = document.createRange();
          range.setStart(n, idx - offset);
          range.setEnd(n, Math.min(idx - offset + anchor.length, n.length));
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(range);
          n.parentElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          break;
        }
        offset += n.length;
      }
    }, 100);
  }

  if (loading || !lesson) {
    return (
      <div className="min-h-dvh bg-bg pb-24">
        <AppNav />
        <div className="md:ml-56 max-w-2xl mx-auto px-5 py-20 space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg" style={{ background: 'var(--color-surface)' }} />
          ))}
        </div>
      </div>
    );
  }

  const status = lessonStatus(lesson);
  const dueCount = filterDue(cards).length;
  const filteredQuestions = typeFilter === 'all' ? questions : questions.filter((q) => q.question_type === typeFilter);
  const practiceAnswered = Object.keys(chosen).length;
  const practiceCorrect = Object.entries(chosen).filter(([qid, ci]) =>
    questions.find((q) => q.id === qid)?.correct_index === ci
  ).length;

  // Key facts: first 4 flashcards for Study tab
  const keyFacts = cards.slice(0, 4);

  return (
    <div className="min-h-dvh bg-bg pb-24 md:pb-8">
      <AppNav />

      <div className="md:ml-56">
        {/* ── Header ── */}
        <header className="px-5 py-4 md:px-8" style={{ borderBottom: '1px solid var(--color-divider)' }}>
          {section && (
            <Link
              href={`/sections/${section.slug}`}
              className="inline-flex items-center gap-1.5 text-[13px] text-n500 hover:text-fg transition-colors mb-3"
            >
              <ArrowLeft size={14} />
              {section.name}
            </Link>
          )}
          <h1 className="text-[20px] font-medium text-fg leading-snug tracking-[-0.02em]">
            {lesson.title}
          </h1>
          <p className="text-[13px] text-n600 mt-1 tabular-nums">
            {cards.length} cards · {questions.length} questions
            {dueCount > 0 && (
              <> · <span style={{ color: 'var(--color-accent-md)' }}>{dueCount} due</span></>
            )}
          </p>
        </header>

        {/* ── Segmented tab control ── */}
        <div className="px-5 py-3 md:px-8" style={{ borderBottom: '1px solid var(--color-divider)' }}>
          <div className="seg max-w-md">
            {(['study', 'source', 'cards', 'practice'] as Tab[]).map((t) => {
              const labels: Record<Tab, string> = {
                study: 'Study', source: 'Source', cards: `Cards${cards.length ? ` · ${cards.length}` : ''}`, practice: 'Practice',
              };
              return (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`seg-opt${tab === t ? ' active' : ''}`}
                >
                  {labels[t]}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Tab content ── */}
        <div className="max-w-2xl mx-auto px-5 py-6 md:px-8">

          {/* ── Study tab ── */}
          {tab === 'study' && (
            <div className="space-y-5">
              {(status === 'empty' || status === 'generating') ? (
                <GeneratingState status={status} generationError={generationError} type="study content" />
              ) : (
                <>
                  {/* Why it matters card */}
                  {lesson.why_it_matters && (
                    <div className="rounded-lg px-5 py-4" style={{ background: 'var(--color-surface)' }}>
                      <p className="text-[11px] font-medium text-n600 uppercase tracking-wide mb-3">
                        Why this matters on the exam
                      </p>
                      <p className="text-[16px] text-fg leading-[1.75]">{lesson.why_it_matters}</p>
                    </div>
                  )}

                  {/* Key facts */}
                  {keyFacts.length > 0 && (
                    <div>
                      <p className="text-[11px] font-medium text-n600 uppercase tracking-wide mb-3">Key facts</p>
                      <div className="rounded-lg overflow-hidden" style={{ background: 'var(--color-surface)' }}>
                        {keyFacts.map((card, i) => (
                          <div
                            key={card.id}
                            className={`flex gap-4 px-4 py-3 ${i > 0 ? 'row-rule' : ''}`}
                          >
                            <span
                              className="text-[13px] text-n500 shrink-0 leading-relaxed"
                              style={{ width: '118px', minWidth: '118px' }}
                            >
                              {card.front}
                            </span>
                            <span className="text-[13px] text-fg leading-relaxed">{card.back}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Parsed source body */}
                  <div className="space-y-4">
                    {parseSource(lesson.source_content).map((block, i) => {
                      if (block.type === 'heading') {
                        return (
                          <h3 key={i} className="text-[15px] font-medium text-fg mt-2 tracking-[-0.01em]">
                            {block.text}
                          </h3>
                        );
                      }
                      if (block.type === 'sub') {
                        return (
                          <p key={i} className="text-[13px] font-medium" style={{ color: 'var(--color-accent-md)' }}>
                            {block.text}
                          </p>
                        );
                      }
                      if (block.type === 'note') {
                        return (
                          <div
                            key={i}
                            className="rounded-r-lg px-4 py-3"
                            style={{
                              background: 'var(--color-n900)',
                              boxShadow: 'inset 2px 0 0 var(--color-accent)',
                            }}
                          >
                            <p className="text-[14px] text-n400 leading-relaxed">{block.text}</p>
                          </div>
                        );
                      }
                      if (block.type === 'list') {
                        return (
                          <ul key={i} className="space-y-1.5">
                            {block.items.map((item, j) => (
                              <li key={j} className="flex items-start gap-3 text-[16px] text-fg leading-[1.75]">
                                <span
                                  className="mt-2.5 w-1 h-1 rounded-sm shrink-0"
                                  style={{ background: 'var(--color-accent)' }}
                                />
                                {item}
                              </li>
                            ))}
                          </ul>
                        );
                      }
                      return (
                        <p key={i} className="text-[16px] text-fg leading-[1.75]">{block.text}</p>
                      );
                    })}
                  </div>

                  {/* Complete button */}
                  {!lesson.completed_at ? (
                    <button
                      onClick={async () => {
                        await db.markLessonComplete(supabase, lesson.id);
                        setLesson((prev) => prev ? { ...prev, completed_at: new Date().toISOString() } : prev);
                      }}
                      className="btn btn-secondary btn-block"
                      style={{ paddingTop: '10px', paddingBottom: '10px' }}
                    >
                      Mark as completed
                    </button>
                  ) : (
                    <p className="text-[12px] text-n600 text-center">
                      Completed {new Date(lesson.completed_at).toLocaleDateString()}
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Source tab ── */}
          {tab === 'source' && (
            <div>
              <div
                ref={sourceRef}
                className="text-[14px] leading-relaxed"
                style={{
                  color: 'var(--color-n400)',
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'var(--font-sans)',
                }}
              >
                {lesson.source_content}
              </div>

              {/* Textbook search bar */}
              <div
                className="mt-8 flex items-center gap-3 rounded-lg px-4 py-3"
                style={{ background: 'var(--color-surface)' }}
              >
                <BookOpen size={16} className="text-n600 shrink-0" />
                <span className="text-[13px] text-n500 flex-1">Check against the textbook</span>
                <button
                  onClick={openTextbookSearch}
                  className="text-[13px] font-medium transition-colors"
                  style={{ color: 'var(--color-accent-md)' }}
                >
                  Search →
                </button>
              </div>

              {textbookOpen && (
                <div className="mt-3 space-y-3">
                  <div className="flex gap-2">
                    <input
                      value={textbookQuery}
                      onChange={(e) => setTextbookQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && runTextbookSearch()}
                      placeholder="Search textbook…"
                      className="input flex-1"
                    />
                    <button onClick={runTextbookSearch} className="btn btn-primary">Go</button>
                    <button
                      onClick={() => { setTextbookOpen(false); setTextbookResults([]); }}
                      className="btn btn-secondary"
                    >
                      ✕
                    </button>
                  </div>

                  {textbookLoading && (
                    <div className="space-y-2">
                      {[1, 2].map((i) => (
                        <div key={i} className="h-16 animate-pulse rounded-lg" style={{ background: 'var(--color-surface)' }} />
                      ))}
                    </div>
                  )}

                  {!textbookLoading && textbookResults.length === 0 && textbookQuery && (
                    <p className="text-[13px] text-n600 text-center py-4">No results.</p>
                  )}

                  {!textbookLoading && textbookResults.map((chunk) => (
                    <div key={chunk.id} className="rounded-lg px-4 py-3 space-y-1.5" style={{ background: 'var(--color-surface)' }}>
                      {chunk.heading && (
                        <p className="text-[11px] font-medium text-n600 uppercase tracking-wide">{chunk.heading}</p>
                      )}
                      <p className="text-[14px] text-n400 leading-relaxed">{chunk.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Cards tab ── */}
          {tab === 'cards' && (
            <div>
              {cards.length === 0 ? (
                <GeneratingState status={status} generationError={generationError} type="cards" />
              ) : (reviewDone || reviewQueue.length === 0) ? (
                <div className="rounded-lg p-6 space-y-4 text-center" style={{ background: 'var(--color-surface)' }}>
                  <p className="text-[20px] font-medium text-fg">
                    {reviewQueue.length === 0 ? 'All caught up' : 'Session done'}
                  </p>
                  {sessionTotal > 0 && (
                    <p className="text-[14px] text-n500">{sessionCorrect} / {sessionTotal} correct</p>
                  )}
                  <div className="space-y-2 pt-2">
                    <button
                      onClick={() => {
                        setReviewQueue(cards);
                        setReviewIdx(0); setFlipped(false);
                        setSessionCorrect(0); setSessionTotal(0); setReviewDone(false);
                      }}
                      className="btn btn-secondary btn-block"
                    >
                      Review all {cards.length} cards
                    </button>
                    {reviewDone && filterDue(cards).length > 0 && (
                      <button
                        onClick={() => {
                          setReviewQueue(filterDue(cards));
                          setReviewIdx(0); setFlipped(false);
                          setSessionCorrect(0); setSessionTotal(0); setReviewDone(false);
                        }}
                        className="btn btn-primary btn-block"
                      >
                        Review {filterDue(cards).length} due
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <CardReview
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
                <GeneratingState status={status} generationError={generationError} type="questions" />
              ) : (
                <>
                  {/* Filter pills */}
                  <div className="flex gap-2 flex-wrap">
                    {(['all', 'factual', 'scenario', 'calculation'] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => setTypeFilter(t)}
                        className="px-3 py-1 rounded-full text-[12px] font-medium transition-colors"
                        style={{
                          background: typeFilter === t ? 'var(--color-accent-dk)' : 'var(--color-surface)',
                          color: typeFilter === t ? 'var(--color-accent-md)' : 'var(--color-n500)',
                          border: typeFilter === t ? '1px solid var(--color-accent)' : '1px solid var(--color-divider)',
                        }}
                      >
                        {t === 'all'
                          ? `All (${questions.length})`
                          : `${TYPE_LABEL[t]} (${questions.filter((q) => q.question_type === t).length})`}
                      </button>
                    ))}
                  </div>

                  {practiceAnswered > 0 && (
                    <p className="text-[12px] text-n600 tabular-nums">
                      {practiceCorrect}/{practiceAnswered} correct
                    </p>
                  )}

                  <div className="space-y-4">
                    {filteredQuestions.map((q, qi) => {
                      const isRevealed = !!revealed[q.id];
                      const chosenIdx = chosen[q.id];

                      return (
                        <div key={q.id} className="rounded-lg overflow-hidden" style={{ background: 'var(--color-surface)' }}>
                          {/* Question stem */}
                          <div className="px-4 pt-4 pb-3" style={{ borderBottom: '1px solid var(--color-divider)' }}>
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-[12px] text-n700 tabular-nums">{qi + 1}.</span>
                              <span className="tag tag-neutral">{TYPE_LABEL[q.question_type]}</span>
                            </div>
                            <p className="text-[15px] text-fg leading-relaxed">{q.stem}</p>
                          </div>

                          {/* Options */}
                          <div>
                            {q.options.map((opt, ci) => {
                              const isChosen = chosenIdx === ci;
                              const isCorrect = q.correct_index === ci;
                              let optStyle: React.CSSProperties = {
                                background: 'transparent',
                                color: 'var(--color-fg)',
                              };
                              if (isRevealed) {
                                if (isCorrect) {
                                  optStyle = {
                                    background: 'color-mix(in srgb, var(--color-accent) 16%, transparent)',
                                    color: 'var(--color-accent-md)',
                                    boxShadow: 'inset 0 0 0 1px var(--color-accent)',
                                  };
                                } else if (isChosen) {
                                  optStyle = {
                                    background: 'transparent',
                                    color: 'var(--color-n700)',
                                    boxShadow: 'inset 0 0 0 1px var(--color-n800)',
                                  };
                                } else {
                                  optStyle = {
                                    background: 'var(--color-bg)',
                                    color: 'var(--color-n700)',
                                  };
                                }
                              }
                              return (
                                <button
                                  key={ci}
                                  disabled={isRevealed}
                                  onClick={() => handlePracticeAnswer(q, ci)}
                                  className="w-full text-left flex items-start gap-3 px-4 py-3 text-[14px] transition-colors"
                                  style={{
                                    ...optStyle,
                                    borderTop: '1px solid var(--color-divider)',
                                  }}
                                >
                                  <span className="font-medium text-n600 shrink-0 tabular-nums w-4">
                                    {String.fromCharCode(65 + ci)}.
                                  </span>
                                  <span className="flex-1">{opt}</span>
                                </button>
                              );
                            })}
                          </div>

                          {/* Explanation */}
                          {isRevealed && (
                            <div
                              className="px-4 py-3"
                              style={{
                                background: 'var(--color-bg)',
                                borderTop: '1px solid var(--color-divider)',
                              }}
                            >
                              <p className="text-[13px] text-n400 leading-relaxed">{q.explanation}</p>
                              {q.source_anchor && (
                                <button
                                  onClick={() => scrollToAnchor(q.source_anchor)}
                                  className="mt-2 text-[12px] text-n600 hover:text-n400 italic transition-colors"
                                >
                                  &ldquo;{q.source_anchor}&rdquo; →
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
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function CardReview({
  card, cardNum, total, flipped, onFlip, onCorrect, onWrong, onAnchorClick,
}: {
  card: Flashcard; cardNum: number; total: number; flipped: boolean;
  onFlip: () => void; onCorrect: () => void; onWrong: () => void;
  onAnchorClick: (anchor: string | null) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-[12px] text-n600 tabular-nums">{cardNum} of {total}</span>
        {card.lapses > 0 && (
          <span className="text-[11px] text-n700 tabular-nums">{card.lapses} lapses</span>
        )}
      </div>

      <button
        onClick={onFlip}
        className="w-full text-left cursor-pointer rounded-lg transition-colors"
        style={{
          minHeight: '230px',
          padding: '28px 24px',
          background: 'var(--color-surface)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <p className="text-[11px] font-medium text-n600 uppercase tracking-wide mb-4">
          {flipped ? 'Answer' : 'Term'}
        </p>
        <p className="text-[20px] font-medium text-fg leading-relaxed flex-1">
          {flipped ? card.back : card.front}
        </p>
        {!flipped && (
          <p className="text-[12px] text-n700 mt-4">Tap to reveal</p>
        )}
        {flipped && card.source_anchor && (
          <button
            onClick={(e) => { e.stopPropagation(); onAnchorClick(card.source_anchor); }}
            className="mt-4 text-[12px] text-n600 hover:text-n400 italic transition-colors"
          >
            &ldquo;{card.source_anchor.slice(0, 60)}&hellip;&rdquo; →
          </button>
        )}
      </button>

      <div className={`flex gap-3 transition-all duration-150 ${flipped ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <button
          onClick={onWrong}
          className="flex-1 py-3 rounded-lg text-[14px] font-medium text-n400 transition-colors"
          style={{ border: '1px solid var(--color-divider)' }}
        >
          Again
        </button>
        <button
          onClick={onCorrect}
          className="flex-1 py-3 rounded-lg text-[14px] font-medium transition-colors"
          style={{
            background: 'color-mix(in srgb, var(--color-accent) 16%, transparent)',
            color: 'var(--color-accent-md)',
            border: '1px solid var(--color-accent)',
          }}
        >
          Got it
        </button>
      </div>
    </div>
  );
}

function GeneratingState({
  status, generationError, type,
}: {
  status: ReturnType<typeof lessonStatus>;
  generationError?: boolean;
  type: string;
}) {
  if (status === 'empty') {
    return (
      <div className="rounded-lg p-6 text-center" style={{ background: 'var(--color-surface)' }}>
        <p className="text-[15px] font-medium text-fg mb-2">No source content</p>
        <p className="text-[14px] text-n500">Add content via the Ingest page to generate {type}.</p>
      </div>
    );
  }
  if (generationError) {
    return (
      <div className="rounded-lg p-6 text-center space-y-2" style={{ background: 'var(--color-surface)' }}>
        <p className="text-[15px] text-fg">Generation is taking longer than expected.</p>
        <p className="text-[14px] text-n500">Refresh in a moment to check for {type}.</p>
      </div>
    );
  }
  if (status === 'generating') {
    return (
      <div className="rounded-lg p-6 text-center space-y-3" style={{ background: 'var(--color-surface)' }}>
        <Spinner />
        <p className="text-[14px] text-n500">Generating {type}…</p>
      </div>
    );
  }
  return (
    <div className="rounded-lg p-6 text-center" style={{ background: 'var(--color-surface)' }}>
      <p className="text-[14px] text-n500">No {type} found.</p>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="w-5 h-5 animate-spin text-n600 mx-auto" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
