-- ════════════════════════════════════════════════════════════════════════
-- Migration 005b: Consolidate phantom modules → Module 1 + Section 1.1
-- Run ONLY after verifying 005a re-link counts are correct.
--
-- What this does:
--   1. Creates one real Module 1 "Overview of Mortgage Lending" per user
--   2. Creates Section 1.1 "History of the Mortgage Industry" under it
--   3. Reassigns all lessons, flashcards, and quiz questions to Module 1
--   4. Sets section_id on all existing lessons to Section 1.1
--   5. Returns row counts for verification
-- After confirming the summary counts, run the DELETE at the bottom.
-- ════════════════════════════════════════════════════════════════════════

WITH
-- One row per user (each user had phantom modules; we create one real module)
user_refs AS (
  SELECT DISTINCT user_id FROM user_modules
),

-- Insert the canonical Module 1 for each user
new_modules AS (
  INSERT INTO user_modules (user_id, number, chapter, title, position)
  SELECT user_id, 1, '1', 'Overview of Mortgage Lending', 0
  FROM user_refs
  RETURNING id, user_id
),

-- Insert Section 1.1 under each user's Module 1
new_sections AS (
  INSERT INTO user_sections (user_id, module_id, number, title, position)
  SELECT nm.user_id, nm.id, '1.1', 'History of the Mortgage Industry', 0
  FROM new_modules nm
  RETURNING id, module_id, user_id
),

-- Reassign lessons: point to new module + new section
updated_lessons AS (
  UPDATE user_lessons ul
  SET
    module_id  = ns.module_id,
    section_id = ns.id
  FROM new_sections ns
  WHERE ul.user_id = ns.user_id
    AND ul.module_id NOT IN (
      SELECT module_id FROM new_sections WHERE user_id = ul.user_id
    )
  RETURNING ul.id
),

-- Reassign flashcards: point module_id to new module
updated_cards AS (
  UPDATE user_flashcards uf
  SET module_id = ns.module_id
  FROM new_sections ns
  WHERE uf.user_id = ns.user_id
    AND uf.module_id NOT IN (
      SELECT module_id FROM new_sections WHERE user_id = uf.user_id
    )
  RETURNING uf.id
),

-- Reassign quiz questions: same
updated_quiz AS (
  UPDATE user_quiz_questions uqq
  SET module_id = ns.module_id
  FROM new_sections ns
  WHERE uqq.user_id = ns.user_id
    AND uqq.module_id NOT IN (
      SELECT module_id FROM new_sections WHERE user_id = uqq.user_id
    )
  RETURNING uqq.id
)

-- Summary — review before running the DELETE below
SELECT
  (SELECT COUNT(*) FROM new_modules)     AS modules_created,
  (SELECT COUNT(*) FROM new_sections)    AS sections_created,
  (SELECT COUNT(*) FROM updated_lessons) AS lessons_reassigned,
  (SELECT COUNT(*) FROM updated_cards)   AS flashcards_reassigned,
  (SELECT COUNT(*) FROM updated_quiz)    AS quiz_questions_reassigned;

-- ════════════════════════════════════════════════════════════════════════
-- STEP 2: After confirming the summary above, run this DELETE to remove
-- the phantom per-lesson modules. Phantom modules have number IS NULL
-- (the real Module 1 has number = 1).
-- ════════════════════════════════════════════════════════════════════════

-- DELETE FROM user_modules WHERE number IS NULL;

-- ════════════════════════════════════════════════════════════════════════
-- FINAL VERIFICATION — uncomment and run after the DELETE to confirm
-- the complete three-level hierarchy is correct.
-- ════════════════════════════════════════════════════════════════════════

-- SELECT
--   um.number                          AS module_num,
--   um.title                           AS module_title,
--   us.number                          AS section_num,
--   us.title                           AS section_title,
--   ul.chapter                         AS chapter_number,
--   ul.title                           AS lesson_title,
--   COUNT(DISTINCT uf.id)              AS flashcards,
--   COUNT(DISTINCT uqq.id)             AS quiz_questions
-- FROM user_modules um
-- LEFT JOIN user_sections       us  ON us.module_id  = um.id
-- LEFT JOIN user_lessons        ul  ON ul.section_id = us.id
-- LEFT JOIN user_flashcards     uf  ON uf.lesson_id  = ul.id
-- LEFT JOIN user_quiz_questions uqq ON uqq.lesson_id = ul.id
-- GROUP BY um.number, um.title, us.number, us.title, ul.chapter, ul.title
-- ORDER BY um.number NULLS LAST, us.number NULLS LAST, ul.chapter NULLS LAST;
