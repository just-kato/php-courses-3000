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
  number: number | null;    // e.g. 1, 2, 3 — null for pre-migration rows
  chapter: string;          // legacy field (kept for NOT NULL constraint)
  title: string;
  position: number;
  created_at: string;
};

export type UserSection = {
  id: string;
  user_id: string;
  module_id: string;
  number: string;           // e.g. "1.1", "1.2"
  title: string;
  position: number;
  created_at: string;
};

export type UserLesson = {
  id: string;
  user_id: string;
  module_id: string;
  section_id: string | null;
  title: string;
  chapter: string | null;       // full chapter number e.g. "1.1.1.a"
  notes_markdown: string;
  why_it_matters: string | null;
  sort_order: number;
  created_at: string;
};

export type UserFlashcard = {
  id: string;
  user_id: string;
  module_id: string;
  lesson_id: string | null;
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
  | { type: 'section'; id: string }
  | { type: 'lesson'; id: string };

export function scopeFromParams(
  lesson: string | null,
  section: string | null,
  module_: string | null
): Scope {
  if (lesson)  return { type: 'lesson',  id: lesson };
  if (section) return { type: 'section', id: section };
  if (module_) return { type: 'module',  id: module_ };
  return { type: 'all' };
}

// ── Display labels ─────────────────────────────────────────────────────────────

export function moduleLabel(mod: UserModule): string {
  return mod.number != null ? `Module ${mod.number}: ${mod.title}` : mod.title;
}

export function sectionLabel(section: UserSection): string {
  return `${section.number} ${section.title}`;
}

export function lessonLabel(lesson: UserLesson): string {
  return lesson.chapter ? `${lesson.chapter} — ${lesson.title}` : lesson.title;
}

// ── Chapter number parser ──────────────────────────────────────────────────────
// "1.2.3.a" → { moduleNumber: 1, sectionNumber: "1.2" }

export function parseChapterNumber(chapter: string): {
  moduleNumber: number | null;
  sectionNumber: string | null;
} {
  const parts = chapter.trim().split('.');
  const moduleNumber = parts[0] ? parseInt(parts[0], 10) : null;
  const sectionNumber =
    parts.length >= 2 && !isNaN(moduleNumber!)
      ? `${parts[0]}.${parts[1]}`
      : null;
  return {
    moduleNumber: isNaN(moduleNumber ?? NaN) ? null : moduleNumber,
    sectionNumber,
  };
}
