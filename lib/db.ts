import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Profile,
  FlashcardProgress,
  QuizAttempt,
  LessonProgress,
  DBachievement,
  UserModule,
  UserLesson,
  UserFlashcard,
  UserQuizQuestion,
} from './db-types';

// ── Profile ──────────────────────────────────────────────────────────────────

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

// ── Flashcard Progress ────────────────────────────────────────────────────────

export async function getFlashcardProgress(
  supabase: SupabaseClient,
  userId: string
): Promise<FlashcardProgress[]> {
  const { data, error } = await supabase
    .from('flashcard_progress')
    .select('*')
    .eq('user_id', userId);
  if (error) { console.error('[db] getFlashcardProgress', error.message); return []; }
  return data as FlashcardProgress[];
}

export async function upsertFlashcardProgress(
  supabase: SupabaseClient,
  userId: string,
  cardId: string,
  updates: Partial<Omit<FlashcardProgress, 'id' | 'user_id' | 'card_id' | 'created_at' | 'updated_at'>>
): Promise<void> {
  const { error } = await supabase
    .from('flashcard_progress')
    .upsert(
      { user_id: userId, card_id: cardId, ...updates },
      { onConflict: 'user_id,card_id' }
    );
  if (error) console.error('[db] upsertFlashcardProgress', error.message);
}

export async function getDailyCardCount(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const { count, error } = await supabase
    .from('flashcard_progress')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('last_reviewed', `${today}T00:00:00Z`);
  if (error) { console.error('[db] getDailyCardCount', error.message); return 0; }
  return count ?? 0;
}

// ── Quiz Attempts ─────────────────────────────────────────────────────────────

export async function getQuizAttempts(
  supabase: SupabaseClient,
  userId: string
): Promise<QuizAttempt[]> {
  const { data, error } = await supabase
    .from('quiz_attempts')
    .select('*')
    .eq('user_id', userId)
    .order('answered_at', { ascending: false });
  if (error) { console.error('[db] getQuizAttempts', error.message); return []; }
  return data as QuizAttempt[];
}

export async function addQuizAttempt(
  supabase: SupabaseClient,
  userId: string,
  attempt: { question_id: string; chosen_index: number; is_correct: boolean }
): Promise<void> {
  const { error } = await supabase
    .from('quiz_attempts')
    .insert({ user_id: userId, ...attempt });
  if (error) console.error('[db] addQuizAttempt', error.message);
}

export async function getDailyQuizCount(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const { count, error } = await supabase
    .from('quiz_attempts')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('answered_at', `${today}T00:00:00Z`);
  if (error) { console.error('[db] getDailyQuizCount', error.message); return 0; }
  return count ?? 0;
}

// ── Lesson Progress ───────────────────────────────────────────────────────────

export async function getLessonProgress(
  supabase: SupabaseClient,
  userId: string
): Promise<LessonProgress[]> {
  const { data, error } = await supabase
    .from('lesson_progress')
    .select('*')
    .eq('user_id', userId);
  if (error) { console.error('[db] getLessonProgress', error.message); return []; }
  return data as LessonProgress[];
}

export async function upsertLessonProgress(
  supabase: SupabaseClient,
  userId: string,
  lessonId: string,
  read: boolean
): Promise<void> {
  const { error } = await supabase
    .from('lesson_progress')
    .upsert(
      { user_id: userId, lesson_id: lessonId, read, read_at: read ? new Date().toISOString() : null },
      { onConflict: 'user_id,lesson_id' }
    );
  if (error) console.error('[db] upsertLessonProgress', error.message);
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

// ── User Modules ──────────────────────────────────────────────────────────────

export async function getUserModules(
  supabase: SupabaseClient,
  userId: string
): Promise<UserModule[]> {
  const { data, error } = await supabase
    .from('user_modules')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) { console.error('[db] getUserModules', error.message); return []; }
  return data as UserModule[];
}

export async function getUserModuleById(
  supabase: SupabaseClient,
  moduleId: string
): Promise<UserModule | null> {
  const { data, error } = await supabase
    .from('user_modules')
    .select('*')
    .eq('id', moduleId)
    .single();
  if (error) { console.error('[db] getUserModuleById', error.message); return null; }
  return data as UserModule;
}

export async function createUserModule(
  supabase: SupabaseClient,
  userId: string,
  module: { chapter?: string; title: string }
): Promise<UserModule | null> {
  const { data, error } = await supabase
    .from('user_modules')
    .insert({ user_id: userId, chapter: module.chapter ?? '', title: module.title })
    .select()
    .single();
  if (error) { console.error('[db] createUserModule', error.message); return null; }
  return data as UserModule;
}

// ── User Lessons ──────────────────────────────────────────────────────────────

export async function getUserLessons(
  supabase: SupabaseClient,
  userId: string,
  moduleId?: string
): Promise<UserLesson[]> {
  let query = supabase
    .from('user_lessons')
    .select('*')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (moduleId) query = query.eq('module_id', moduleId);
  const { data, error } = await query;
  if (error) { console.error('[db] getUserLessons', error.message); return []; }
  return data as UserLesson[];
}

export async function getUserLessonById(
  supabase: SupabaseClient,
  lessonId: string
): Promise<UserLesson | null> {
  const { data, error } = await supabase
    .from('user_lessons')
    .select('*')
    .eq('id', lessonId)
    .single();
  if (error) { console.error('[db] getUserLessonById', error.message); return null; }
  return data as UserLesson;
}

export async function createUserLesson(
  supabase: SupabaseClient,
  lesson: Omit<UserLesson, 'id' | 'created_at'>
): Promise<UserLesson | null> {
  const { data, error } = await supabase
    .from('user_lessons')
    .insert(lesson)
    .select()
    .single();
  if (error) { console.error('[db] createUserLesson', error.message); return null; }
  return data as UserLesson;
}

export async function updateLessonWhyItMatters(
  supabase: SupabaseClient,
  lessonId: string,
  whyItMatters: string
): Promise<void> {
  const { error } = await supabase
    .from('user_lessons')
    .update({ why_it_matters: whyItMatters })
    .eq('id', lessonId);
  if (error) console.error('[db] updateLessonWhyItMatters', error.message);
}

export async function getLessonCountForModule(
  supabase: SupabaseClient,
  moduleId: string
): Promise<number> {
  const { count, error } = await supabase
    .from('user_lessons')
    .select('*', { count: 'exact', head: true })
    .eq('module_id', moduleId);
  if (error) { console.error('[db] getLessonCountForModule', error.message); return 0; }
  return count ?? 0;
}

// ── User Flashcards ───────────────────────────────────────────────────────────

export async function getUserFlashcards(
  supabase: SupabaseClient,
  userId: string,
  moduleId?: string
): Promise<UserFlashcard[]> {
  let query = supabase
    .from('user_flashcards')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (moduleId) query = query.eq('module_id', moduleId);
  const { data, error } = await query;
  if (error) { console.error('[db] getUserFlashcards', error.message); return []; }
  return data as UserFlashcard[];
}

export async function createUserFlashcards(
  supabase: SupabaseClient,
  cards: Omit<UserFlashcard, 'id' | 'created_at'>[]
): Promise<void> {
  if (cards.length === 0) return;
  const { error } = await supabase.from('user_flashcards').insert(cards);
  if (error) console.error('[db] createUserFlashcards', error.message);
}

// ── User Quiz Questions ───────────────────────────────────────────────────────

export async function getUserQuizQuestions(
  supabase: SupabaseClient,
  userId: string,
  moduleId?: string
): Promise<UserQuizQuestion[]> {
  let query = supabase
    .from('user_quiz_questions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (moduleId) query = query.eq('module_id', moduleId);
  const { data, error } = await query;
  if (error) { console.error('[db] getUserQuizQuestions', error.message); return []; }
  return data as UserQuizQuestion[];
}

export async function createUserQuizQuestions(
  supabase: SupabaseClient,
  questions: Omit<UserQuizQuestion, 'id' | 'created_at'>[]
): Promise<void> {
  if (questions.length === 0) return;
  const { error } = await supabase.from('user_quiz_questions').insert(questions);
  if (error) console.error('[db] createUserQuizQuestions', error.message);
}
