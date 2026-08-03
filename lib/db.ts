import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Profile,
  DBachievement,
  Section,
  Lesson,
  Flashcard,
  Question,
  Attempt,
} from './db-types';

// ── Profile ───────────────────────────────────────────────────────────────────

export async function getProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error('[db] getProfile', error.message);
    return null;
  }
  return data as Profile;
}

export async function upsertProfile(
  supabase: SupabaseClient,
  userId: string,
  updates: Partial<Omit<Profile, 'user_id' | 'created_at' | 'updated_at'>>
): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .upsert({ user_id: userId, ...updates }, { onConflict: 'user_id' });
  if (error) console.error('[db] upsertProfile', error.message);
}

// ── Achievements ──────────────────────────────────────────────────────────────

export async function getUserAchievements(
  supabase: SupabaseClient,
  userId: string
): Promise<DBachievement[]> {
  const { data, error } = await supabase
    .from('achievements')
    .select('*')
    .eq('user_id', userId)
    .order('unlocked_at', { ascending: false });
  if (error) { console.error('[db] getUserAchievements', error.message); return []; }
  return data as DBachievement[];
}

export async function addAchievement(
  supabase: SupabaseClient,
  userId: string,
  achievementId: string
): Promise<void> {
  const { error } = await supabase
    .from('achievements')
    .upsert(
      { user_id: userId, achievement_id: achievementId },
      { onConflict: 'user_id,achievement_id', ignoreDuplicates: true }
    );
  if (error) console.error('[db] addAchievement', error.message);
}

// ── Sections ──────────────────────────────────────────────────────────────────

export async function getSections(supabase: SupabaseClient): Promise<Section[]> {
  const { data, error } = await supabase
    .from('sections')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) { console.error('[db] getSections', error.message); return []; }
  return data as Section[];
}

export async function getSectionBySlug(
  supabase: SupabaseClient,
  slug: string
): Promise<Section | null> {
  const { data, error } = await supabase
    .from('sections')
    .select('*')
    .eq('slug', slug)
    .single();
  if (error) { console.error('[db] getSectionBySlug', error.message); return null; }
  return data as Section;
}

// ── Lessons ───────────────────────────────────────────────────────────────────

export async function getLessons(
  supabase: SupabaseClient,
  userId: string,
  sectionId?: string
): Promise<Lesson[]> {
  let query = supabase
    .from('lessons')
    .select('*')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (sectionId) query = query.eq('section_id', sectionId);
  const { data, error } = await query;
  if (error) { console.error('[db] getLessons', error.message); return []; }
  return data as Lesson[];
}

export async function getLessonById(
  supabase: SupabaseClient,
  lessonId: string
): Promise<Lesson | null> {
  const { data, error } = await supabase
    .from('lessons')
    .select('*')
    .eq('id', lessonId)
    .single();
  if (error) { console.error('[db] getLessonById', error.message); return null; }
  return data as Lesson;
}

export async function createLesson(
  supabase: SupabaseClient,
  lesson: {
    section_id: string;
    user_id: string;
    title: string;
    source_content: string;
    sort_order?: number;
  }
): Promise<Lesson | null> {
  const { data, error } = await supabase
    .from('lessons')
    .insert({ sort_order: 0, ...lesson })
    .select()
    .single();
  if (error) { console.error('[db] createLesson', error.message); return null; }
  return data as Lesson;
}

export async function updateLessonGenerated(
  supabase: SupabaseClient,
  lessonId: string,
  updates: { why_it_matters: string; generated_at: string }
): Promise<void> {
  const { error } = await supabase
    .from('lessons')
    .update(updates)
    .eq('id', lessonId);
  if (error) console.error('[db] updateLessonGenerated', error.message);
}

export async function markLessonComplete(
  supabase: SupabaseClient,
  lessonId: string
): Promise<void> {
  const { error } = await supabase
    .from('lessons')
    .update({ completed_at: new Date().toISOString() })
    .eq('id', lessonId);
  if (error) console.error('[db] markLessonComplete', error.message);
}

export async function getLessonCountForSection(
  supabase: SupabaseClient,
  userId: string,
  sectionId: string
): Promise<number> {
  const { count, error } = await supabase
    .from('lessons')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('section_id', sectionId);
  if (error) { console.error('[db] getLessonCountForSection', error.message); return 0; }
  return count ?? 0;
}

// ── Flashcards ────────────────────────────────────────────────────────────────

export async function getFlashcards(
  supabase: SupabaseClient,
  lessonId: string
): Promise<Flashcard[]> {
  const { data, error } = await supabase
    .from('flashcards')
    .select('*')
    .eq('lesson_id', lessonId)
    .order('created_at', { ascending: true });
  if (error) { console.error('[db] getFlashcards', error.message); return []; }
  return data as Flashcard[];
}

// Load all cards for a user (for global review queue), joining through lessons
export async function getAllFlashcards(
  supabase: SupabaseClient,
  userId: string,
  sectionId?: string
): Promise<Flashcard[]> {
  // Join flashcards → lessons to filter by user_id (RLS handles auth, but we need the join for sectionId)
  let query = supabase
    .from('flashcards')
    .select('*, lessons!inner(user_id, section_id)')
    .eq('lessons.user_id', userId);
  if (sectionId) query = query.eq('lessons.section_id', sectionId);
  const { data, error } = await query;
  if (error) { console.error('[db] getAllFlashcards', error.message); return []; }
  // Strip the nested lessons join from the returned rows
  return (data as (Flashcard & { lessons: unknown })[]).map(({ lessons: _l, ...card }) => card as Flashcard);
}

export async function insertFlashcards(
  supabase: SupabaseClient,
  cards: Omit<Flashcard, 'id' | 'ease' | 'interval_days' | 'due_at' | 'lapses' | 'created_at'>[]
): Promise<void> {
  if (cards.length === 0) return;
  const { error } = await supabase.from('flashcards').insert(cards);
  if (error) console.error('[db] insertFlashcards', error.message);
}

export async function deleteFlashcardsForLesson(
  supabase: SupabaseClient,
  lessonId: string
): Promise<void> {
  const { error } = await supabase
    .from('flashcards')
    .delete()
    .eq('lesson_id', lessonId);
  if (error) console.error('[db] deleteFlashcardsForLesson', error.message);
}

export async function updateFlashcardSRS(
  supabase: SupabaseClient,
  cardId: string,
  updates: { ease: number; interval_days: number; due_at: string; lapses: number }
): Promise<void> {
  const { error } = await supabase
    .from('flashcards')
    .update(updates)
    .eq('id', cardId);
  if (error) console.error('[db] updateFlashcardSRS', error.message);
}

// ── Questions ─────────────────────────────────────────────────────────────────

export async function getQuestions(
  supabase: SupabaseClient,
  lessonId: string
): Promise<Question[]> {
  const { data, error } = await supabase
    .from('questions')
    .select('*')
    .eq('lesson_id', lessonId)
    .order('created_at', { ascending: true });
  if (error) { console.error('[db] getQuestions', error.message); return []; }
  return data as Question[];
}

export async function getAllQuestions(
  supabase: SupabaseClient,
  userId: string,
  sectionId?: string
): Promise<Question[]> {
  let query = supabase
    .from('questions')
    .select('*, lessons!inner(user_id, section_id)')
    .eq('lessons.user_id', userId);
  if (sectionId) query = query.eq('lessons.section_id', sectionId);
  const { data, error } = await query;
  if (error) { console.error('[db] getAllQuestions', error.message); return []; }
  return (data as (Question & { lessons: unknown })[]).map(({ lessons: _l, ...q }) => q as Question);
}

export async function insertQuestions(
  supabase: SupabaseClient,
  questions: Omit<Question, 'id' | 'created_at'>[]
): Promise<void> {
  if (questions.length === 0) return;
  const { error } = await supabase.from('questions').insert(questions);
  if (error) console.error('[db] insertQuestions', error.message);
}

export async function deleteQuestionsForLesson(
  supabase: SupabaseClient,
  lessonId: string
): Promise<void> {
  const { error } = await supabase
    .from('questions')
    .delete()
    .eq('lesson_id', lessonId);
  if (error) console.error('[db] deleteQuestionsForLesson', error.message);
}

// ── Attempts ──────────────────────────────────────────────────────────────────

export async function recordAttempt(
  supabase: SupabaseClient,
  attempt: Omit<Attempt, 'id' | 'answered_at'>
): Promise<void> {
  const { error } = await supabase.from('attempts').insert(attempt);
  if (error) console.error('[db] recordAttempt', error.message);
}

export async function getAttempts(
  supabase: SupabaseClient,
  userId: string,
  since?: Date
): Promise<Attempt[]> {
  let query = supabase
    .from('attempts')
    .select('*')
    .eq('user_id', userId)
    .order('answered_at', { ascending: false });
  if (since) query = query.gte('answered_at', since.toISOString());
  const { data, error } = await query;
  if (error) { console.error('[db] getAttempts', error.message); return []; }
  return data as Attempt[];
}
