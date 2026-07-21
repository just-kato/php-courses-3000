-- Add "Why It Matters" causal explainer field to lessons (nullable — backfilled on demand)
ALTER TABLE user_lessons ADD COLUMN IF NOT EXISTS why_it_matters text;
