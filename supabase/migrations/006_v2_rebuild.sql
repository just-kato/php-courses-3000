-- ════════════════════════════════════════════════════════════════════════
-- Migration 006: v2 Rebuild — gut v1 content, create v2 schema, seed sections
--
-- Preserves: auth.users, profiles, achievements (gamification infra)
-- Drops:     all v1 content tables + their progress tables
-- Creates:   sections, lessons, flashcards, questions, attempts
-- Seeds:     5 fixed exam sections with question_mix ratios
-- ════════════════════════════════════════════════════════════════════════

-- ── Drop v1 content tables ────────────────────────────────────────────────────

DROP TABLE IF EXISTS public.user_quiz_questions  CASCADE;
DROP TABLE IF EXISTS public.user_flashcards      CASCADE;
DROP TABLE IF EXISTS public.user_lessons         CASCADE;
DROP TABLE IF EXISTS public.user_sections        CASCADE;
DROP TABLE IF EXISTS public.user_modules         CASCADE;
DROP TABLE IF EXISTS public.flashcard_progress   CASCADE;
DROP TABLE IF EXISTS public.quiz_attempts        CASCADE;
DROP TABLE IF EXISTS public.lesson_progress      CASCADE;

-- ── sections — fixed, seeded once, not user-editable ─────────────────────────

CREATE TABLE public.sections (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text        UNIQUE NOT NULL,
  name          text        NOT NULL,
  exam_weight   numeric     NOT NULL,     -- 0.27 = 27% of exam score
  sort_order    int         NOT NULL,
  question_mix  jsonb       NOT NULL      -- { factual, scenario, calculation } ratios
);

ALTER TABLE public.sections ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read sections (shared global data, not per-user)
CREATE POLICY "authenticated users read sections"
  ON public.sections FOR SELECT TO authenticated USING (true);

GRANT SELECT ON public.sections TO authenticated;

-- ── lessons — user-created, one per paste ─────────────────────────────────────

CREATE TABLE public.lessons (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id      uuid        NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title           text        NOT NULL,
  sort_order      int         NOT NULL DEFAULT 0,
  source_content  text        NOT NULL DEFAULT '',  -- verbatim paste, NEVER overwritten
  why_it_matters  text,                             -- generated
  generated_at    timestamptz,                      -- null = not yet generated
  completed_at    timestamptz,                      -- null = not marked complete
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users own their lessons"
  ON public.lessons FOR ALL USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lessons TO authenticated;

CREATE INDEX ON public.lessons (user_id, section_id, sort_order);

-- ── flashcards — SM-2 state lives here, not in a separate progress table ──────

CREATE TABLE public.flashcards (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id     uuid        NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  front         text        NOT NULL,    -- description / scenario side
  back          text        NOT NULL,    -- term / rule / number
  source_anchor text,                    -- short supporting quote from source_content
  -- SM-2 scheduling state
  ease          numeric     NOT NULL DEFAULT 2.5,
  interval_days int         NOT NULL DEFAULT 0,
  due_at        timestamptz,             -- null = due now (new card)
  lapses        int         NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.flashcards ENABLE ROW LEVEL SECURITY;

-- RLS via lesson ownership — no user_id column directly on flashcards
CREATE POLICY "users own flashcards for their lessons"
  ON public.flashcards FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.lessons
      WHERE lessons.id = flashcards.lesson_id
        AND lessons.user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.flashcards TO authenticated;

CREATE INDEX ON public.flashcards (lesson_id);

-- ── questions ─────────────────────────────────────────────────────────────────

CREATE TABLE public.questions (
  id              uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id       uuid    NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  question_type   text    NOT NULL CHECK (question_type IN ('factual', 'scenario', 'calculation')),
  stem            text    NOT NULL,
  options         jsonb   NOT NULL,     -- string[4]
  correct_index   int     NOT NULL,
  explanation     text    NOT NULL,     -- covers why right AND why best distractor fails
  source_anchor   text,                 -- supporting quote from source_content
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users own questions for their lessons"
  ON public.questions FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.lessons
      WHERE lessons.id = questions.lesson_id
        AND lessons.user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.questions TO authenticated;

CREATE INDEX ON public.questions (lesson_id);
CREATE INDEX ON public.questions (lesson_id, question_type);

-- ── attempts — quiz answer history ───────────────────────────────────────────

CREATE TABLE public.attempts (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id   uuid        NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chosen_index  int         NOT NULL,
  correct       bool        NOT NULL,
  answered_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users own their attempts"
  ON public.attempts FOR ALL USING (auth.uid() = user_id);

GRANT SELECT, INSERT ON public.attempts TO authenticated;

CREATE INDEX ON public.attempts (user_id, question_id);
CREATE INDEX ON public.attempts (user_id, answered_at DESC);

-- ── Seed: 5 exam sections ─────────────────────────────────────────────────────
-- sort_order follows the prep guide (Federal Laws first)
-- exam_weight drives progress math, not display order

INSERT INTO public.sections (slug, name, exam_weight, sort_order, question_mix) VALUES
  ('federal-laws',
   'Federal Mortgage Related Laws',
   0.24, 1,
   '{"factual": 0.50, "scenario": 0.50, "calculation": 0.00}'),

  ('origination-activities',
   'Mortgage Loan Origination Activities',
   0.27, 2,
   '{"factual": 0.25, "scenario": 0.40, "calculation": 0.35}'),

  ('general-knowledge',
   'General Mortgage Knowledge',
   0.20, 3,
   '{"factual": 0.55, "scenario": 0.35, "calculation": 0.10}'),

  ('ethics',
   'Ethics',
   0.18, 4,
   '{"factual": 0.20, "scenario": 0.80, "calculation": 0.00}'),

  ('uniform-state',
   'Uniform State Content',
   0.11, 5,
   '{"factual": 0.75, "scenario": 0.25, "calculation": 0.00}');

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
