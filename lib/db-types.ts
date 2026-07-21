// TypeScript types mirroring the Supabase database schema

export type Profile = {
  user_id: string;
  xp: number;
  level: number;
  current_streak: number;
  longest_streak: number;
  last_active_date: string | null; // DATE as ISO string YYYY-MM-DD
  daily_goal: number;
  created_at: string;
  updated_at: string;
};

export type FlashcardProgress = {
  id: string;
  user_id: string;
  card_id: string;
  leitner_box: number; // 1-5
  last_reviewed: string | null; // timestamptz
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
  notes_markdown: string;
  sort_order: number;
  created_at: string;
};

export type UserFlashcard = {
  id: string;
  user_id: string;
  module_id: string;
  question: string;
  answer: string;
  created_at: string;
};

export type UserQuizQuestion = {
  id: string;
  user_id: string;
  module_id: string;
  prompt: string;
  choices: string[];
  correct_index: number;
  explanation: string;
  created_at: string;
};
