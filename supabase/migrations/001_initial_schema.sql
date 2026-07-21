-- ============================================================
-- MLO Study App — Initial Schema
-- Run this in the Supabase SQL editor (or via Supabase CLI)
-- ============================================================

-- Profiles (one row per authenticated user)
CREATE TABLE public.profiles (
  user_id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  xp              INTEGER NOT NULL DEFAULT 0,
  level           INTEGER NOT NULL DEFAULT 1,
  current_streak  INTEGER NOT NULL DEFAULT 0,
  longest_streak  INTEGER NOT NULL DEFAULT 0,
  last_active_date DATE,
  daily_goal      INTEGER NOT NULL DEFAULT 20,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Per-card Leitner state
CREATE TABLE public.flashcard_progress (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  card_id       TEXT NOT NULL,
  leitner_box   INTEGER NOT NULL DEFAULT 1 CHECK (leitner_box BETWEEN 1 AND 5),
  last_reviewed TIMESTAMPTZ,
  times_correct INTEGER NOT NULL DEFAULT 0,
  times_wrong   INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, card_id)
);

-- Individual quiz answers
CREATE TABLE public.quiz_attempts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id  TEXT NOT NULL,
  chosen_index INTEGER NOT NULL,
  is_correct   BOOLEAN NOT NULL,
  answered_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Lesson read state
CREATE TABLE public.lesson_progress (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_id  TEXT NOT NULL,
  read       BOOLEAN NOT NULL DEFAULT FALSE,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, lesson_id)
);

-- Earned badges
CREATE TABLE public.achievements (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_id TEXT NOT NULL,
  unlocked_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, achievement_id)
);

-- ============================================================
-- Row Level Security — each user owns their own rows
-- ============================================================

ALTER TABLE public.profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flashcard_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_attempts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_progress    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.achievements       ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

-- flashcard_progress
CREATE POLICY "flashcard_progress_select" ON public.flashcard_progress FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "flashcard_progress_insert" ON public.flashcard_progress FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "flashcard_progress_update" ON public.flashcard_progress FOR UPDATE USING (auth.uid() = user_id);

-- quiz_attempts
CREATE POLICY "quiz_attempts_select" ON public.quiz_attempts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "quiz_attempts_insert" ON public.quiz_attempts FOR INSERT WITH CHECK (auth.uid() = user_id);

-- lesson_progress
CREATE POLICY "lesson_progress_select" ON public.lesson_progress FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "lesson_progress_insert" ON public.lesson_progress FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "lesson_progress_update" ON public.lesson_progress FOR UPDATE USING (auth.uid() = user_id);

-- achievements
CREATE POLICY "achievements_select" ON public.achievements FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "achievements_insert" ON public.achievements FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- Auto-create profile when a user signs up
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- Keep updated_at current
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_updated_at           BEFORE UPDATE ON public.profiles           FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER flashcard_progress_updated_at BEFORE UPDATE ON public.flashcard_progress FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER lesson_progress_updated_at    BEFORE UPDATE ON public.lesson_progress    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
