-- Track chunked generation state so large-source retries resume rather than restart.
-- generation_chunk IS NULL  → not started, or fully complete (check generated_at to distinguish)
-- generation_chunk = N      → chunk N failed; resume from there on retry

ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS generation_chunk int;
