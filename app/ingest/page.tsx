'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle } from '@phosphor-icons/react';
import { createClient } from '@/utils/supabase/client';
import { AppNav } from '@/components/AppNav';
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
    if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null; }
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
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
  const isActive = step === 'form' || step === 'error';

  async function handleSubmit() {
    if (!userId || !canSubmit) return;
    setErrorMsg(null);

    const section = sections.find((s) => s.id === sectionId);
    if (!section) return;

    setStep('saving');
    const lesson = await db.createLesson(supabase, {
      section_id: sectionId,
      user_id: userId,
      title: title.trim(),
      source_content: sourceContent,
    });

    if (!lesson) { setErrorMsg('Failed to save. Please try again.'); setStep('error'); return; }

    setSavedLessonId(lesson.id);
    setSavedSectionSlug(section.slug);
    setStep('generating');

    const channel = supabase
      .channel(`ingest-gen-${lesson.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'lessons', filter: `id=eq.${lesson.id}` },
        (payload) => {
          if ((payload.new as Lesson).generated_at) { cleanup(); setStep('done'); }
        }
      )
      .subscribe();
    channelRef.current = channel;

    timeoutRef.current = setTimeout(() => {
      cleanup();
      setErrorMsg('Generation is taking longer than expected. Your source is saved — check the lesson in a moment.');
      setStep('done');
    }, 3 * 60 * 1000);

    fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lessonId: lesson.id,
        title: lesson.title,
        sourceContent: lesson.source_content,
        questionMix: section.question_mix,
      }),
    }).catch(() => {});
  }

  function resetForNext() {
    setTitle(''); setSourceContent(''); setErrorMsg(null);
    setSavedLessonId(null); setSavedSectionSlug(null); setStep('form');
  }

  return (
    <div className="min-h-dvh bg-bg pb-24 md:pb-8">
      <AppNav />

      <div className="md:ml-56 flex flex-col md:flex-row min-h-dvh">
        {/* ── Left: form ── */}
        <div className="flex-1 max-w-2xl mx-auto w-full px-5 py-6 space-y-5">
          <header>
            <h1 className="text-[17px] font-medium text-fg">Add lesson</h1>
            <p className="text-[13px] text-n500 mt-0.5">Paste content — source is saved immediately</p>
          </header>

          {/* Done state */}
          {step === 'done' && savedLessonId && savedSectionSlug && (
            <div className="rounded-lg p-6 space-y-5" style={{ background: 'var(--color-surface)' }}>
              <div className="flex items-center gap-2">
                <CheckCircle size={18} weight="fill" style={{ color: 'var(--color-accent-md)' }} />
                <span className="text-[14px] font-medium" style={{ color: 'var(--color-accent-md)' }}>Saved</span>
                {!errorMsg && <span className="text-[13px] text-n600">· generation complete</span>}
              </div>
              <p className="text-[17px] font-medium text-fg leading-snug">{title}</p>
              {errorMsg && (
                <p className="text-[13px] text-n500 leading-relaxed rounded-lg px-4 py-3"
                  style={{ background: 'var(--color-bg)' }}>
                  {errorMsg}
                </p>
              )}
              <div className="space-y-2">
                <a href={`/lessons/${savedLessonId}`} className="btn btn-primary btn-block">View lesson →</a>
                <a href={`/sections/${savedSectionSlug}`} className="btn btn-secondary btn-block">Section overview</a>
                <button onClick={resetForNext} className="btn btn-secondary btn-block">Paste next lesson</button>
              </div>
            </div>
          )}

          {/* Form */}
          {(step === 'form' || step === 'saving' || step === 'generating' || step === 'error') && (
            <div className="space-y-4">
              {errorMsg && step === 'error' && (
                <div className="rounded-lg px-4 py-3 text-[13px] text-n400"
                  style={{ background: 'var(--color-surface)', border: '1px solid var(--color-divider)' }}>
                  {errorMsg}
                </div>
              )}

              <div className="field">
                <label>Section</label>
                <select
                  value={sectionId}
                  onChange={(e) => setSectionId(e.target.value)}
                  disabled={!isActive}
                  className="input"
                  style={{ appearance: 'none' }}
                >
                  {sections.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label>Lesson title</label>
                <input
                  type="text"
                  placeholder="e.g. TRID Fee Tolerances"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={!isActive}
                  className="input"
                />
              </div>

              <div className="field">
                <label>Source content</label>
                <textarea
                  rows={14}
                  placeholder="Paste the prep guide text here…"
                  value={sourceContent}
                  onChange={(e) => setSourceContent(e.target.value)}
                  disabled={!isActive}
                  className="input"
                  style={{ resize: 'none', lineHeight: '1.65' }}
                />
                <div className="flex items-center justify-between mt-1.5">
                  <p className="text-[11px] text-n700 tabular-nums">
                    {wordCount > 0 ? `${wordCount.toLocaleString()} words` : ''}
                  </p>
                  {wordCount > 0 && (
                    <p className="text-[11px] text-n700 tabular-nums">
                      ~{Math.max(12, Math.min(30, Math.round(wordCount / 130)))} questions
                    </p>
                  )}
                </div>
              </div>

              <button
                onClick={handleSubmit}
                disabled={!canSubmit || !isActive}
                className="btn btn-primary btn-block"
                style={{ paddingTop: '10px', paddingBottom: '10px' }}
              >
                {step === 'saving' ? (
                  <span className="flex items-center gap-2"><Spinner /> Saving source…</span>
                ) : step === 'generating' ? (
                  <span className="flex items-center gap-2"><Spinner /> Generating…</span>
                ) : (
                  'Save & Generate'
                )}
              </button>

              {step === 'generating' && (
                <p className="text-[12px] text-n600 text-center leading-relaxed">
                  Source is saved. You can close this tab — generation finishes in the background.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
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
