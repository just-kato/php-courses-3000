-- User-owned dynamic content tables
-- Run this after 001_initial_schema.sql

CREATE TABLE user_modules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chapter     text NOT NULL,          -- e.g. "1", "2.3"
  title       text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_lessons (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module_id       uuid NOT NULL REFERENCES user_modules(id) ON DELETE CASCADE,
  title           text NOT NULL,
  notes_markdown  text NOT NULL,
  sort_order      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_flashcards (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module_id   uuid NOT NULL REFERENCES user_modules(id) ON DELETE CASCADE,
  question    text NOT NULL,
  answer      text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_quiz_questions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module_id     uuid NOT NULL REFERENCES user_modules(id) ON DELETE CASCADE,
  prompt        text NOT NULL,
  choices       text[] NOT NULL,
  correct_index integer NOT NULL,
  explanation   text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Indexes for fast per-user queries
CREATE INDEX ON user_modules     (user_id, created_at);
CREATE INDEX ON user_lessons     (user_id, module_id, sort_order);
CREATE INDEX ON user_flashcards  (user_id, module_id);
CREATE INDEX ON user_quiz_questions (user_id, module_id);

-- Row Level Security
ALTER TABLE user_modules        ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_lessons        ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_flashcards     ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_quiz_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users own their modules"        ON user_modules        FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "users own their lessons"        ON user_lessons        FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "users own their flashcards"     ON user_flashcards     FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "users own their quiz questions" ON user_quiz_questions FOR ALL USING (auth.uid() = user_id);
