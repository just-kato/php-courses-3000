-- ════════════════════════════════════════════════════════════════════════
-- Migration 005a: Three-level hierarchy — schema additions + flashcard re-link
-- Safe to run: adds columns/tables and re-links orphaned content rows.
-- REVIEW the verification SELECT at the bottom before running 005b.
-- ════════════════════════════════════════════════════════════════════════

-- 1. Create sections table
CREATE TABLE IF NOT EXISTS user_sections (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module_id  uuid        NOT NULL REFERENCES user_modules(id) ON DELETE CASCADE,
  number     text        NOT NULL,          -- e.g. "1.1", "1.2"
  title      text        NOT NULL,
  position   integer     NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users own their sections"
  ON user_sections FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS user_sections_module_idx
  ON user_sections (user_id, module_id, position);

-- 2. Add section_id to lessons (nullable — backfilled by 005b)
ALTER TABLE user_lessons
  ADD COLUMN IF NOT EXISTS section_id uuid REFERENCES user_sections(id) ON DELETE SET NULL;

-- 3. Add number + position to modules
ALTER TABLE user_modules
  ADD COLUMN IF NOT EXISTS number   integer;

ALTER TABLE user_modules
  ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 0;

-- Allow omitting chapter on INSERT going forward (it's a legacy NOT NULL field)
ALTER TABLE user_modules
  ALTER COLUMN chapter SET DEFAULT '';

-- ── Re-link orphaned flashcards to their lessons ──────────────────────────────
-- Each "phantom" module had exactly one lesson (the old add-lesson bug created
-- one module per lesson). Join via module_id to recover the lesson association.

UPDATE user_flashcards uf
SET lesson_id = ul.id
FROM user_lessons ul
WHERE ul.module_id = uf.module_id
  AND uf.lesson_id IS NULL;

-- ── Re-link orphaned quiz questions the same way ──────────────────────────────

UPDATE user_quiz_questions uqq
SET lesson_id = ul.id
FROM user_lessons ul
WHERE ul.module_id = uqq.module_id
  AND uqq.lesson_id IS NULL;

-- ════════════════════════════════════════════════════════════════════════
-- VERIFICATION — review these counts before running 005b.
-- Every lesson should show ≥ 0 flashcards and quiz questions.
-- If any row shows unexpected 0s for a lesson that should have cards,
-- stop and investigate before proceeding.
-- ════════════════════════════════════════════════════════════════════════

SELECT
  ul.chapter                       AS chapter_number,
  ul.title                         AS lesson_title,
  COUNT(DISTINCT uf.id)            AS flashcards_linked,
  COUNT(DISTINCT uqq.id)           AS quiz_questions_linked
FROM user_lessons ul
LEFT JOIN user_flashcards     uf  ON uf.lesson_id  = ul.id
LEFT JOIN user_quiz_questions uqq ON uqq.lesson_id = ul.id
GROUP BY ul.id, ul.chapter, ul.title
ORDER BY ul.chapter NULLS LAST, ul.created_at;
