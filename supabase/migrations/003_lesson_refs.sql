-- Add chapter number to lessons, and lesson-level foreign keys to content rows
-- All new columns are nullable — existing rows are unaffected, no data migration needed

ALTER TABLE user_lessons ADD COLUMN IF NOT EXISTS chapter text;

ALTER TABLE user_flashcards ADD COLUMN IF NOT EXISTS lesson_id uuid REFERENCES user_lessons(id) ON DELETE SET NULL;
ALTER TABLE user_quiz_questions ADD COLUMN IF NOT EXISTS lesson_id uuid REFERENCES user_lessons(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS user_flashcards_lesson_id_idx     ON user_flashcards     (user_id, lesson_id);
CREATE INDEX IF NOT EXISTS user_quiz_questions_lesson_id_idx ON user_quiz_questions (user_id, lesson_id);
