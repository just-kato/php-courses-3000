'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { BottomNav } from '@/components/BottomNav';
import * as db from '@/lib/db';
import type { UserModule } from '@/lib/db-types';
import type { GenerateResponse } from '@/app/api/generate/route';

// ── Types ─────────────────────────────────────────────────────────────────────

type Step = 'form' | 'generating' | 'review' | 'saving' | 'done';

type EditableCard = { question: string; answer: string; keep: boolean };
type EditableQuestion = {
  prompt: string;
  choices: string[];
  correctIndex: number;
  explanation: string;
  keep: boolean;
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AddLessonPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [userId, setUserId] = useState<string | null>(null);
  const [existingModules, setExistingModules] = useState<UserModule[]>([]);
  const [step, setStep] = useState<Step>('form');
  const [error, setError] = useState<string | null>(null);

  // Form fields
  const [selectedModuleId, setSelectedModuleId] = useState<string>('new');
  const [newModuleTitle, setNewModuleTitle] = useState('');
  const [chapter, setChapter] = useState('');
  const [lessonTitle, setLessonTitle] = useState('');
  const [rawContent, setRawContent] = useState('');

  // Review state
  const [notesMarkdown, setNotesMarkdown] = useState('');
  const [flashcards, setFlashcards] = useState<EditableCard[]>([]);
  const [quizQuestions, setQuizQuestions] = useState<EditableQuestion[]>([]);
  const [savedLessonId, setSavedLessonId] = useState<string | null>(null);
  const [savedModuleId, setSavedModuleId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/sign-in'); return; }
      setUserId(user.id);
      const mods = await db.getUserModules(supabase, user.id);
      setExistingModules(mods);
    });
  }, [supabase, router]);

  // ── Generate ────────────────────────────────────────────────────────────────

  async function handleGenerate() {
    if (!rawContent.trim() || !lessonTitle.trim() || !chapter.trim()) return;
    if (selectedModuleId === 'new' && !newModuleTitle.trim()) return;
    setError(null);
    setStep('generating');

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: lessonTitle, chapter, rawContent }),
      });
      const json = await res.json() as GenerateResponse & { error?: string };
      if (!res.ok || json.error) throw new Error(json.error ?? 'Generation failed');

      setNotesMarkdown(json.notesMarkdown);
      setFlashcards(json.flashcards.map((c) => ({ ...c, keep: true })));
      setQuizQuestions(json.quizQuestions.map((q) => ({ ...q, keep: true })));
      setStep('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed. Please try again.');
      setStep('form');
    }
  }

  // ── Save ─────────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!userId) return;
    setStep('saving');

    try {
      // 1. Resolve module
      let moduleId: string;
      if (selectedModuleId === 'new') {
        const mod = await db.createUserModule(supabase, userId, {
          chapter,
          title: newModuleTitle.trim(),
        });
        if (!mod) throw new Error('Failed to create module');
        moduleId = mod.id;
      } else {
        moduleId = selectedModuleId;
      }

      // 2. Determine sort order
      const count = await db.getLessonCountForModule(supabase, moduleId);

      // 3. Insert lesson
      const lesson = await db.createUserLesson(supabase, {
        user_id: userId,
        module_id: moduleId,
        title: lessonTitle.trim(),
        notes_markdown: notesMarkdown,
        sort_order: count,
      });
      if (!lesson) throw new Error('Failed to save lesson');

      // 4. Insert flashcards
      const keptCards = flashcards.filter((c) => c.keep);
      await db.createUserFlashcards(
        supabase,
        keptCards.map((c) => ({
          user_id: userId,
          module_id: moduleId,
          question: c.question,
          answer: c.answer,
        }))
      );

      // 5. Insert quiz questions
      const keptQuestions = quizQuestions.filter((q) => q.keep);
      await db.createUserQuizQuestions(
        supabase,
        keptQuestions.map((q) => ({
          user_id: userId,
          module_id: moduleId,
          prompt: q.prompt,
          choices: q.choices,
          correct_index: q.correctIndex,
          explanation: q.explanation,
        }))
      );

      setSavedLessonId(lesson.id);
      setSavedModuleId(moduleId);
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed. Please try again.');
      setStep('review');
    }
  }

  // ── Flashcard editors ────────────────────────────────────────────────────────

  function updateCard(i: number, field: 'question' | 'answer', value: string) {
    setFlashcards((prev) => prev.map((c, idx) => idx === i ? { ...c, [field]: value } : c));
  }
  function toggleCard(i: number) {
    setFlashcards((prev) => prev.map((c, idx) => idx === i ? { ...c, keep: !c.keep } : c));
  }

  // ── Quiz question editors ─────────────────────────────────────────────────

  function updateQuestion(i: number, field: 'prompt' | 'explanation', value: string) {
    setQuizQuestions((prev) => prev.map((q, idx) => idx === i ? { ...q, [field]: value } : q));
  }
  function updateChoice(qi: number, ci: number, value: string) {
    setQuizQuestions((prev) => prev.map((q, idx) => {
      if (idx !== qi) return q;
      const choices = [...q.choices];
      choices[ci] = value;
      return { ...q, choices };
    }));
  }
  function updateCorrectIndex(qi: number, ci: number) {
    setQuizQuestions((prev) => prev.map((q, idx) => idx === qi ? { ...q, correctIndex: ci } : q));
  }
  function toggleQuestion(i: number) {
    setQuizQuestions((prev) => prev.map((q, idx) => idx === i ? { ...q, keep: !q.keep } : q));
  }

  const canGenerate =
    rawContent.trim().length > 0 &&
    lessonTitle.trim().length > 0 &&
    chapter.trim().length > 0 &&
    (selectedModuleId !== 'new' || newModuleTitle.trim().length > 0);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-dvh bg-paper pb-28">
      <header className="bg-card border-b border-rule px-5 py-3.5">
        <h1 className="font-serif text-lg font-semibold text-ink tracking-tight">Add Lesson</h1>
        <p className="font-sans text-xs text-ink-2 mt-0.5">Generate study materials with AI</p>
      </header>

      <div className="max-w-lg mx-auto px-5 py-6 space-y-6">

        {/* ── Form ── */}
        {(step === 'form' || step === 'generating') && (
          <div className="space-y-5">
            {error && (
              <div className="border border-accent/40 bg-wrong rounded-md px-4 py-3 font-sans text-sm text-ink">
                {error}
              </div>
            )}

            {/* Module */}
            <div className="space-y-1.5">
              <label className="font-sans text-xs font-semibold uppercase tracking-wider text-ink-2">Module</label>
              <select
                value={selectedModuleId}
                onChange={(e) => setSelectedModuleId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-md border border-rule bg-card font-sans text-sm text-ink focus:outline-none focus:border-accent transition-colors"
              >
                <option value="new">+ Create new module</option>
                {existingModules.map((m) => (
                  <option key={m.id} value={m.id}>{m.chapter ? `${m.chapter} — ` : ''}{m.title}</option>
                ))}
              </select>
              {selectedModuleId === 'new' && (
                <input
                  type="text"
                  placeholder="Module title (e.g. Overview of Mortgage Lending)"
                  value={newModuleTitle}
                  onChange={(e) => setNewModuleTitle(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-md border border-rule bg-card font-sans text-sm text-ink placeholder:text-ink-2/50 focus:outline-none focus:border-accent transition-colors mt-2"
                />
              )}
            </div>

            {/* Chapter + Title */}
            <div className="grid grid-cols-5 gap-3">
              <div className="space-y-1.5 col-span-2">
                <label className="font-sans text-xs font-semibold uppercase tracking-wider text-ink-2">Chapter</label>
                <input
                  type="text"
                  placeholder="1.1.1.d"
                  value={chapter}
                  onChange={(e) => setChapter(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-md border border-rule bg-card font-sans text-sm text-ink placeholder:text-ink-2/50 focus:outline-none focus:border-accent transition-colors"
                />
              </div>
              <div className="space-y-1.5 col-span-3">
                <label className="font-sans text-xs font-semibold uppercase tracking-wider text-ink-2">Lesson Title</label>
                <input
                  type="text"
                  placeholder="Department of HUD"
                  value={lessonTitle}
                  onChange={(e) => setLessonTitle(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-md border border-rule bg-card font-sans text-sm text-ink placeholder:text-ink-2/50 focus:outline-none focus:border-accent transition-colors"
                />
              </div>
            </div>

            {/* Raw content */}
            <div className="space-y-1.5">
              <label className="font-sans text-xs font-semibold uppercase tracking-wider text-ink-2">Raw Lesson Content</label>
              <textarea
                rows={14}
                placeholder="Paste the raw lesson text here…"
                value={rawContent}
                onChange={(e) => setRawContent(e.target.value)}
                className="w-full px-3 py-2.5 rounded-md border border-rule bg-card font-sans text-sm text-ink placeholder:text-ink-2/50 focus:outline-none focus:border-accent transition-colors resize-none leading-relaxed"
              />
              {rawContent.length > 0 && (
                <p className="font-sans text-[11px] text-ink-2 tabular-nums text-right">{rawContent.length.toLocaleString()} characters</p>
              )}
            </div>

            <button
              onClick={handleGenerate}
              disabled={!canGenerate || step === 'generating'}
              className="w-full py-3 rounded-md bg-accent text-card font-sans text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-opacity active:scale-[0.99]"
            >
              {step === 'generating' ? (
                <span className="flex items-center justify-center gap-2">
                  <Spinner />
                  Generating study materials…
                </span>
              ) : 'Generate Study Materials'}
            </button>
          </div>
        )}

        {/* ── Review ── */}
        {(step === 'review' || step === 'saving') && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-base font-semibold text-ink">Review Generated Content</h2>
              <button
                onClick={() => { setStep('form'); setError(null); }}
                className="font-sans text-xs text-ink-2 hover:text-ink transition-colors"
              >
                ← Back to form
              </button>
            </div>

            {error && (
              <div className="border border-accent/40 bg-wrong rounded-md px-4 py-3 font-sans text-sm text-ink">
                {error}
              </div>
            )}

            {/* Module + lesson info summary */}
            <div className="border border-rule rounded-md bg-card px-4 py-3 space-y-1">
              <p className="font-sans text-xs text-ink-2">
                <span className="font-medium text-ink">Module:</span>{' '}
                {selectedModuleId === 'new'
                  ? newModuleTitle
                  : existingModules.find((m) => m.id === selectedModuleId)?.title ?? ''}
              </p>
              <p className="font-sans text-xs text-ink-2">
                <span className="font-medium text-ink">{chapter}</span> — {lessonTitle}
              </p>
              <p className="font-sans text-[11px] text-ink-2 mt-1">
                {flashcards.filter((c) => c.keep).length} flashcards · {quizQuestions.filter((q) => q.keep).length} quiz questions
              </p>
            </div>

            {/* Lesson Notes */}
            <section className="space-y-3">
              <h3 className="font-sans text-xs font-semibold uppercase tracking-wider text-ink-2">Lesson Notes</h3>
              <textarea
                rows={12}
                value={notesMarkdown}
                onChange={(e) => setNotesMarkdown(e.target.value)}
                className="w-full px-3 py-2.5 rounded-md border border-rule bg-card font-mono text-xs text-ink leading-relaxed focus:outline-none focus:border-accent transition-colors resize-none"
              />
            </section>

            {/* Flashcards */}
            <section className="space-y-3">
              <h3 className="font-sans text-xs font-semibold uppercase tracking-wider text-ink-2">
                Flashcards ({flashcards.filter((c) => c.keep).length} of {flashcards.length} keeping)
              </h3>
              <div className="space-y-3">
                {flashcards.map((card, i) => (
                  <div
                    key={i}
                    className={`border rounded-md bg-card p-4 space-y-2 transition-opacity ${card.keep ? 'border-rule opacity-100' : 'border-rule/40 opacity-40'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-sans text-[10px] font-semibold uppercase tracking-wider text-ink-2">
                        Card {i + 1}
                      </span>
                      <button
                        onClick={() => toggleCard(i)}
                        className={`font-sans text-[10px] font-medium transition-colors ${card.keep ? 'text-accent hover:text-ink' : 'text-ink-2 hover:text-accent'}`}
                      >
                        {card.keep ? 'Remove' : 'Keep'}
                      </button>
                    </div>
                    <div className="space-y-2">
                      <textarea
                        rows={2}
                        value={card.question}
                        onChange={(e) => updateCard(i, 'question', e.target.value)}
                        placeholder="Question"
                        className="w-full px-3 py-2 rounded border border-rule bg-paper font-sans text-sm text-ink placeholder:text-ink-2/50 focus:outline-none focus:border-accent transition-colors resize-none"
                      />
                      <textarea
                        rows={2}
                        value={card.answer}
                        onChange={(e) => updateCard(i, 'answer', e.target.value)}
                        placeholder="Answer"
                        className="w-full px-3 py-2 rounded border border-rule bg-paper font-sans text-sm text-ink placeholder:text-ink-2/50 focus:outline-none focus:border-accent transition-colors resize-none"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Quiz Questions */}
            <section className="space-y-3">
              <h3 className="font-sans text-xs font-semibold uppercase tracking-wider text-ink-2">
                Quiz Questions ({quizQuestions.filter((q) => q.keep).length} of {quizQuestions.length} keeping)
              </h3>
              <div className="space-y-4">
                {quizQuestions.map((q, qi) => (
                  <div
                    key={qi}
                    className={`border rounded-md bg-card p-4 space-y-3 transition-opacity ${q.keep ? 'border-rule opacity-100' : 'border-rule/40 opacity-40'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-sans text-[10px] font-semibold uppercase tracking-wider text-ink-2">
                        Q{qi + 1}
                      </span>
                      <button
                        onClick={() => toggleQuestion(qi)}
                        className={`font-sans text-[10px] font-medium transition-colors ${q.keep ? 'text-accent hover:text-ink' : 'text-ink-2 hover:text-accent'}`}
                      >
                        {q.keep ? 'Remove' : 'Keep'}
                      </button>
                    </div>

                    <textarea
                      rows={2}
                      value={q.prompt}
                      onChange={(e) => updateQuestion(qi, 'prompt', e.target.value)}
                      placeholder="Question prompt"
                      className="w-full px-3 py-2 rounded border border-rule bg-paper font-sans text-sm text-ink placeholder:text-ink-2/50 focus:outline-none focus:border-accent transition-colors resize-none"
                    />

                    <div className="space-y-1.5">
                      <p className="font-sans text-[10px] text-ink-2 font-medium">Choices — select the correct answer</p>
                      {q.choices.map((choice, ci) => (
                        <div key={ci} className="flex items-center gap-2">
                          <input
                            type="radio"
                            name={`correct-${qi}`}
                            checked={q.correctIndex === ci}
                            onChange={() => updateCorrectIndex(qi, ci)}
                            className="shrink-0 accent-sage"
                          />
                          <span className="font-sans text-xs text-ink-2 tabular-nums w-4 shrink-0">
                            {String.fromCharCode(65 + ci)}.
                          </span>
                          <input
                            type="text"
                            value={choice}
                            onChange={(e) => updateChoice(qi, ci, e.target.value)}
                            className="flex-1 px-2 py-1.5 rounded border border-rule bg-paper font-sans text-sm text-ink focus:outline-none focus:border-accent transition-colors"
                          />
                          {q.correctIndex === ci && (
                            <span className="font-sans text-[10px] text-sage font-medium shrink-0">✓</span>
                          )}
                        </div>
                      ))}
                    </div>

                    <textarea
                      rows={2}
                      value={q.explanation}
                      onChange={(e) => updateQuestion(qi, 'explanation', e.target.value)}
                      placeholder="Explanation"
                      className="w-full px-3 py-2 rounded border border-rule bg-paper font-sans text-sm text-ink placeholder:text-ink-2/50 focus:outline-none focus:border-accent transition-colors resize-none"
                    />
                  </div>
                ))}
              </div>
            </section>

            <button
              onClick={handleSave}
              disabled={step === 'saving'}
              className="w-full py-3 rounded-md bg-accent text-card font-sans text-sm font-medium hover:opacity-90 disabled:opacity-60 transition-opacity active:scale-[0.99] sticky bottom-24"
            >
              {step === 'saving' ? (
                <span className="flex items-center justify-center gap-2">
                  <Spinner />
                  Saving…
                </span>
              ) : `Save Lesson, ${flashcards.filter((c) => c.keep).length} Cards & ${quizQuestions.filter((q) => q.keep).length} Questions`}
            </button>
          </div>
        )}

        {/* ── Done ── */}
        {step === 'done' && savedLessonId && savedModuleId && (
          <div className="border border-rule rounded-md bg-card p-6 space-y-5">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sage text-lg">✓</span>
                <h2 className="font-serif text-xl font-semibold text-ink">Saved</h2>
              </div>
              <p className="font-sans text-sm text-ink-2 leading-relaxed">
                <span className="font-medium text-ink">{lessonTitle}</span> has been added with{' '}
                {flashcards.filter((c) => c.keep).length} flashcards and{' '}
                {quizQuestions.filter((q) => q.keep).length} quiz questions.
              </p>
            </div>

            <div className="space-y-2">
              <a
                href={`/learn/${savedModuleId}/${savedLessonId}`}
                className="block w-full py-2.5 rounded-md bg-accent text-card font-sans text-sm font-medium text-center hover:opacity-90 transition-opacity"
              >
                Read Lesson →
              </a>
              <a
                href={`/flashcards?module=${savedModuleId}`}
                className="block w-full py-2.5 rounded-md border border-rule font-sans text-sm font-medium text-ink-2 text-center hover:border-ink-2 hover:text-ink transition-colors"
              >
                Study Flashcards
              </a>
              <button
                onClick={() => {
                  setStep('form');
                  setRawContent('');
                  setLessonTitle('');
                  setChapter('');
                  setError(null);
                  setSavedLessonId(null);
                  setSavedModuleId(null);
                }}
                className="w-full py-2.5 rounded-md border border-rule font-sans text-sm font-medium text-ink-2 text-center hover:border-ink-2 hover:text-ink transition-colors"
              >
                Add Another Lesson
              </button>
            </div>
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
