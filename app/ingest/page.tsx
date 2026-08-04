'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { BottomNav } from '@/components/BottomNav';
import * as db from '@/lib/db';
import type { Lesson, Section } from '@/lib/db-types';

type Step = 'form' | 'saving' | 'generating' | 'done' | 'error';

export default function IngestPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [userId, setUserId] = useState<string | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [step, setStep] = useState<Step>('form');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [sectionId, setSectionId] = useState('');
  const [title, setTitle] = useState('');
  const [sourceContent, setSourceContent] = useState('');

  const [savedLessonId, setSavedLessonId] = useState<string | null>(null);
  const [savedSectionSlug, setSavedSectionSlug] = useState<string | null>(null);

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/sign-in'); return; }
      setUserId(user.id);
      const sects = await db.getSections(supabase);
      setSections(sects);
      if (sects.length > 0) setSectionId(sects[0].id);
    });
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, router]);

  const wordCount = sourceContent.trim() ? sourceContent.trim().split(/\s+/).length : 0;
  const canSubmit = sectionId && title.trim() && sourceContent.trim().length > 50;

  async function handleSubmit() {
    if (!userId || !canSubmit) return;
    setErrorMsg(null);

    const section = sections.find((s) => s.id === sectionId);
    if (!section) return;

    // Step 1: Save source immediately — this must not be lost
    setStep('saving');
    const lesson = await db.createLesson(supabase, {
      section_id: sectionId,
      user_id: userId,
      title: title.trim(),
      source_content: sourceContent,
    });

    if (!lesson) {
      setErrorMsg('Failed to save lesson. Please try again.');
      setStep('error');
      return;
    }

    setSavedLessonId(lesson.id);
    setSavedSectionSlug(section.slug);

    // Step 2: Watch the DB row — generation state comes from the row, not the fetch promise
    setStep('generating');

    const channel = supabase
      .channel(`ingest-gen-${lesson.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'lessons', filter: `id=eq.${lesson.id}` },
        (payload) => {
          if ((payload.new as Lesson).generated_at) {
            cleanup();
            setStep('done');
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    // 3-minute timeout: source is saved regardless — surface the delay
    timeoutRef.current = setTimeout(() => {
      cleanup();
      setErrorMsg(
        'Generation is taking longer than expected. Your source content is saved — check the lesson page in a moment.'
      );
      setStep('done');
    }, 3 * 60 * 1000);

    // Fire-and-forget: the DB write (and realtime event) drives the UI, not this response
    fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lessonId: lesson.id,
        title: lesson.title,
        sourceContent: lesson.source_content,
        questionMix: section.question_mix,
      }),
    }).catch(() => {
      // Request may be cancelled by navigation — realtime subscription handles completion
    });
  }

  function resetForNext() {
    setTitle('');
    setSourceContent('');
    setErrorMsg(null);
    setSavedLessonId(null);
    setSavedSectionSlug(null);
    setStep('form');
  }

  return (
    <div className="min-h-dvh bg-paper pb-28">
      <header className="bg-card border-b border-rule px-5 py-3.5">
        <h1 className="font-serif text-lg font-semibold text-ink tracking-tight">Add Lesson</h1>
        <p className="font-sans text-xs text-ink-2 mt-0.5">Paste content — source is saved immediately</p>
      </header>

      <div className="max-w-lg mx-auto px-5 py-6 space-y-5">

        {/* Done state */}
        {step === 'done' && savedLessonId && savedSectionSlug && (
          <div className="border border-rule rounded-md bg-card p-6 space-y-5">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="font-sans text-sm text-sage font-semibold">Saved</span>
                {!errorMsg && <span className="font-sans text-sm text-ink-2">· generation complete</span>}
              </div>
              <p className="font-serif text-xl font-semibold text-ink leading-snug">{title}</p>
              {errorMsg && (
                <p className="font-sans text-xs text-ink-2 mt-2 leading-relaxed border border-rule rounded px-3 py-2 bg-paper">
                  {errorMsg}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <a
                href={`/lessons/${savedLessonId}`}
                className="block w-full py-2.5 rounded-md bg-accent text-card font-sans text-sm font-medium text-center hover:opacity-90 transition-opacity"
              >
                View Lesson →
              </a>
              <a
                href={`/sections/${savedSectionSlug}`}
                className="block w-full py-2.5 rounded-md border border-rule font-sans text-sm font-medium text-ink-2 text-center hover:border-ink-2 hover:text-ink transition-colors"
              >
                All lessons in section
              </a>
              <button
                onClick={resetForNext}
                className="w-full py-2.5 rounded-md border border-rule font-sans text-sm font-medium text-ink-2 text-center hover:border-ink-2 hover:text-ink transition-colors"
              >
                Paste next lesson
              </button>
            </div>
          </div>
        )}

        {/* Form */}
        {(step === 'form' || step === 'saving' || step === 'generating' || step === 'error') && (
          <div className="space-y-5">
            {errorMsg && step === 'error' && (
              <div className="border border-rule rounded-md bg-paper px-4 py-3 font-sans text-sm text-ink">
                {errorMsg}
              </div>
            )}

            {/* Section picker */}
            <div className="space-y-1.5">
              <label className="font-sans text-xs font-semibold uppercase tracking-wider text-ink-2">Section</label>
              <select
                value={sectionId}
                onChange={(e) => setSectionId(e.target.value)}
                disabled={step !== 'form' && step !== 'error'}
                className="w-full px-3 py-2.5 rounded-md border border-rule bg-card font-sans text-sm text-ink focus:outline-none focus:border-accent transition-colors disabled:opacity-60"
              >
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Title */}
            <div className="space-y-1.5">
              <label className="font-sans text-xs font-semibold uppercase tracking-wider text-ink-2">Lesson Title</label>
              <input
                type="text"
                placeholder="e.g. TRID Fee Tolerances"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={step !== 'form' && step !== 'error'}
                className="w-full px-3 py-2.5 rounded-md border border-rule bg-card font-sans text-sm text-ink placeholder:text-ink-2/50 focus:outline-none focus:border-accent transition-colors disabled:opacity-60"
              />
            </div>

            {/* Source content */}
            <div className="space-y-1.5">
              <label className="font-sans text-xs font-semibold uppercase tracking-wider text-ink-2">Source Content</label>
              <textarea
                rows={16}
                placeholder="Paste the prep guide text here…"
                value={sourceContent}
                onChange={(e) => setSourceContent(e.target.value)}
                disabled={step !== 'form' && step !== 'error'}
                className="w-full px-3 py-2.5 rounded-md border border-rule bg-card font-sans text-sm text-ink placeholder:text-ink-2/50 focus:outline-none focus:border-accent transition-colors resize-none leading-relaxed disabled:opacity-60"
              />
              <div className="flex items-center justify-between">
                <p className="font-sans text-[11px] text-ink-2 tabular-nums">
                  {wordCount > 0 ? `${wordCount.toLocaleString()} words` : ''}
                </p>
                {wordCount > 0 && (
                  <p className="font-sans text-[11px] text-ink-2 tabular-nums">
                    ~{Math.max(12, Math.min(30, Math.round(wordCount / 130)))} questions
                  </p>
                )}
              </div>
            </div>

            <button
              onClick={handleSubmit}
              disabled={!canSubmit || (step !== 'form' && step !== 'error')}
              className="w-full py-3 rounded-md bg-accent text-card font-sans text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-opacity active:scale-[0.99]"
            >
              {step === 'saving' ? (
                <span className="flex items-center justify-center gap-2">
                  <Spinner /> Saving source…
                </span>
              ) : step === 'generating' ? (
                <span className="flex items-center justify-center gap-2">
                  <Spinner /> Generating questions &amp; cards…
                </span>
              ) : (
                'Save &amp; Generate'
              )}
            </button>

            {step === 'generating' && (
              <p className="font-sans text-[11px] text-ink-2 text-center leading-relaxed">
                Source is already saved. You can close this tab — generation will finish in the background.
              </p>
            )}
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
