// TypeScript types mirroring the Supabase database schema

export type Profile = {
  user_id: string;
  xp: number;
  level: number;
  current_streak: number;
  longest_streak: number;
  last_active_date: string | null;
  daily_goal: number;
  created_at: string;
  updated_at: string;
};

export type FlashcardProgress = {
  id: string;
  user_id: string;
  card_id: string;
  leitner_box: number;
  last_reviewed: string | null;
  times_correct: number;
  times_wrong: number;
  created_at: string;
  updated_at: string;
};

export type QuizAttempt = {
  id: string;
  user_id: string;
  question_id: string;
  chosen_index: number;
  is_correct: boolean;
  answered_at: string;
};

export type LessonProgress = {
  id: string;
  user_id: string;
  lesson_id: string;
  read: boolean;
  read_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DBachievement = {
  id: string;
  user_id: string;
  achievement_id: string;
  unlocked_at: string;
};

// ── User-authored content ──────────────────────────────────────────────────────

export type UserModule = {
  id: string;
  user_id: string;
  chapter: string;
  title: string;
  created_at: string;
};

export type UserLesson = {
  id: string;
  user_id: string;
  module_id: string;
  title: string;
  chapter: string | null;       // e.g. "1.1.1.d"
  notes_markdown: string;
  why_it_matters: string | null;
  sort_order: number;
  created_at: string;
};

export type UserFlashcard = {
  id: string;
  user_id: string;
  module_id: string;
  lesson_id: string | null; // points to the lesson this card was generated from
  question: string;
  answer: string;
  created_at: string;
};

export type UserQuizQuestion = {
  id: string;
  user_id: string;
  module_id: string;
  lesson_id: string | null;
  prompt: string;
  choices: string[];
  correct_index: number;
  explanation: string;
  created_at: string;
};

// ── Scope (shared between flashcards, practice, and sidebar) ──────────────────

export type Scope =
  | { type: 'all' }
  | { type: 'module'; id: string }
  | { type: 'lesson'; id: string };

export function scopeFromParams(lesson: string | null, module_: string | null): Scope {
  if (lesson) return { type: 'lesson', id: lesson };
  if (module_) return { type: 'module', id: module_ };
  return { type: 'all' };
}

export function lessonLabel(lesson: UserLesson): string {
  return lesson.chapter ? `${lesson.chapter} — ${lesson.title}` : lesson.title;
}

export function moduleLabel(mod: UserModule, index: number): string {
  return `Module ${index + 1}: ${mod.title}`;
}
