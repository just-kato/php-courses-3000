// v2 TypeScript types mirroring the Supabase database schema

// ── Gamification (unchanged from v1) ─────────────────────────────────────────

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

export type DBachievement = {
  id: string;
  user_id: string;
  achievement_id: string;
  unlocked_at: string;
};

// ── v2 Content types ──────────────────────────────────────────────────────────

export type QuestionMix = {
  factual: number;
  scenario: number;
  calculation: number;
};

export type Section = {
  id: string;
  slug: string;
  name: string;
  exam_weight: number;   // 0.27 = 27% of the exam
  sort_order: number;
  question_mix: QuestionMix;
};

// Derived status — computed from lesson fields, never stored
export type LessonStatus = 'empty' | 'generating' | 'ready' | 'completed';

export function lessonStatus(lesson: Lesson): LessonStatus {
  if (!lesson.source_content) return 'empty';
  if (!lesson.generated_at) return 'generating';
  if (lesson.completed_at) return 'completed';
  return 'ready';
}

export type Lesson = {
  id: string;
  section_id: string;
  user_id: string;
  title: string;
  sort_order: number;
  source_content: string;      // verbatim paste — NEVER overwritten by regeneration
  why_it_matters: string | null;
  generated_at: string | null; // null = generation not yet run
  completed_at: string | null; // null = not yet marked complete
  created_at: string;
};

export type QuestionType = 'factual' | 'scenario' | 'calculation';

export type Flashcard = {
  id: string;
  lesson_id: string;
  front: string;          // description / scenario side
  back: string;           // term / rule / number
  source_anchor: string | null;
  // SM-2 scheduling state
  ease: number;
  interval_days: number;
  due_at: string | null;  // null = due now (new or just lapsed)
  lapses: number;
  created_at: string;
};

export type Question = {
  id: string;
  lesson_id: string;
  question_type: QuestionType;
  stem: string;
  options: string[];
  correct_index: number;
  explanation: string;
  source_anchor: string | null;
  created_at: string;
};

export type Attempt = {
  id: string;
  question_id: string;
  user_id: string;
  chosen_index: number;
  correct: boolean;
  answered_at: string;
};

// ── Convenience join types ────────────────────────────────────────────────────

export type LessonWithCounts = Lesson & {
  flashcard_count: number;
  question_count: number;
  due_count: number;        // SM-2 due cards right now
};

export type SectionWithLessons = Section & {
  lessons: LessonWithCounts[];
};

// ── Progress math ─────────────────────────────────────────────────────────────

// Estimated scored questions secured = accuracy × (exam_weight × 115)
// 115 = total scored questions on the NMLS exam
export const EXAM_SCORED_QUESTIONS = 115;
export const PASS_THRESHOLD = 86; // 75% of 115

export function estimatedScoredQuestions(
  section: Section,
  accuracy: number // 0-1
): number {
  return accuracy * section.exam_weight * EXAM_SCORED_QUESTIONS;
}
