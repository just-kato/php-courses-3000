# MLO Study App — v2 Rebuild Spec

Personal study app for the NMLS SAFE MLO national licensing exam. This document
specifies a **v2 rebuild**: same core functionality, entirely new data model and
content source.

---

## Context

The exam is the **SAFE MLO Test — National Component with Uniform State Content**.
120 questions (115 scored), 190 minutes, 75% to pass, ~53% first-attempt pass rate.

v1 of this app was structured around the *20-hour pre-licensing course* modules.
That course is complete. v2 is structured around a **separate RealEstateU Exam Prep
Guide** — 59 lessons across 5 sections whose structure mirrors the official NMLS
exam content outline and weightings.

**The prep guide expires in ~166 days.** Once its content is pasted into this app,
the app becomes the permanent copy. Bulk ingestion should be easy and fast.

---

## Stack (do not substitute)

| Layer | Choice |
|---|---|
| Framework | Next.js + TypeScript |
| Styling | Tailwind |
| Auth + DB | **Supabase** (hard requirement) |
| Hosting | Vercel |
| Generation | Anthropic API |

---

## Migration: gut and reseed

All v1 content data is to be dropped. Preserve auth/user rows only.

1. Drop v1 content tables (modules, cards, quiz items, progress).
2. Create the v2 schema below.
3. Seed the 5 sections from the fixed table in this document.
4. Lessons are created empty and populated by paste.

No attempt should be made to migrate v1 flashcards forward. The content source has
changed and the old cards are structured around different material.

---

## Structure: two levels, not three

The prep guide already supplies the hierarchy. **Do not add a "modules" layer.**

```
Section (5, fixed)
└── Lesson (59, user-created by pasting)
    ├── Source excerpt      ← verbatim, never AI-touched
    ├── Why This Matters    ← generated
    ├── Flashcards          ← generated
    └── Practice Questions  ← generated
```

---

## Schema

```sql
-- Fixed. Seeded once, never user-editable.
sections (
  id              uuid pk,
  slug            text unique,          -- 'federal-laws'
  name            text,
  exam_weight     numeric,              -- 0.24 — drives progress math
  sort_order      int,
  question_mix    jsonb                 -- see Question mix below
)

lessons (
  id              uuid pk,
  section_id      uuid fk -> sections,
  title           text,
  sort_order      int,
  source_content  text,                 -- the verbatim paste. NEVER overwritten
                                        -- by regeneration.
  why_it_matters  text,                 -- generated
  generated_at    timestamptz,
  completed_at    timestamptz null,
  user_id         uuid fk -> auth.users
)

flashcards (
  id              uuid pk,
  lesson_id       uuid fk -> lessons on delete cascade,
  front           text,                 -- description / scenario side
  back            text,                 -- the term / rule / number
  source_anchor   text,                 -- short supporting quote from source_content
  -- SRS state
  ease            numeric default 2.5,
  interval_days   int default 0,
  due_at          timestamptz,
  lapses          int default 0
)

questions (
  id              uuid pk,
  lesson_id       uuid fk -> lessons on delete cascade,
  question_type   text check (question_type in ('factual','scenario','calculation')),
  stem            text,
  options         jsonb,                -- string[4]
  correct_index   int,
  explanation     text,                 -- why right AND why the best distractor fails
  source_anchor   text
)

attempts (
  id              uuid pk,
  question_id     uuid fk -> questions,
  user_id         uuid fk -> auth.users,
  chosen_index    int,
  correct         bool,
  answered_at     timestamptz
)
```

**Cascade rule:** regenerating a lesson deletes and reinserts its `flashcards` and
`questions` only. `source_content` is immutable once pasted — it is the ground truth
the user checks generated content against.

---

## Section seed data

| slug | name | exam_weight | ~Questions on exam |
|---|---|---|---|
| `origination-activities` | Mortgage Loan Origination Activities | 0.27 | 31 |
| `federal-laws` | Federal Mortgage Related Laws | 0.24 | 28 |
| `general-knowledge` | General Mortgage Knowledge | 0.20 | 23 |
| `ethics` | Ethics | 0.18 | 21 |
| `uniform-state` | Uniform State Content | 0.11 | 13 |

Display order should follow the prep guide's own numbering (Federal Laws first),
but **progress weighting uses `exam_weight`**, not display order.

---

## Question generation

### Count

Scale with source length. Roughly **1 question per 120–150 words**, floor **12**,
cap **30**. A dense RESPA lesson should generate far more than a short definitional
one — that is correct behavior, not a bug.

### Mix by section (`question_mix` jsonb)

| Section | factual | scenario | calculation |
|---|---|---|---|
| Federal Laws | 0.50 | 0.50 | — |
| Origination Activities | 0.25 | 0.40 | 0.35 |
| Ethics | 0.20 | 0.80 | — |
| General Knowledge | 0.55 | 0.35 | 0.10 |
| Uniform State Content | 0.75 | 0.25 | — |

Read the ratio from the section row. Do not hardcode in the generator.

### Question type definitions

- **factual** — direct recall. Thresholds, timeframes, definitions, which regulation
  implements which act.
- **scenario** — a named borrower with concrete facts; the user must apply a rule.
  This is the format the real exam leans on hardest.
- **calculation** — LTV, front/back DTI, PITI, per diem interest, points, ARM
  adjustment, tolerance ceilings.

### Generation prompt requirements

Every generated question must satisfy:

1. **Scenarios use named people and real numbers.** "Danielle and Chris are
   refinancing at 6.5% with $1,800 in title fees" — not "a borrower has fees."
2. **At least one distractor per question is TRUE but incomplete.** The real exam's
   difficulty is not obviously-wrong options; it is options that are correct
   statements which don't answer what was asked.
3. **Vary the qualifier word** across the set — *best*, *primarily*, *most likely*,
   *except*, *benchmark*. One word frequently decides the answer, and the user needs
   practice noticing it.
4. **Explanation covers both directions** — why the correct answer is correct, and
   why the most tempting distractor fails.
5. **`source_anchor` is populated** with a short supporting quote from
   `source_content`. This is non-negotiable: the source course had multiple broken
   questions, and the user needs to jump from a suspicious answer to the text behind
   it in one click.
6. **Calculation questions show the worked solution** in the explanation, step by
   step — not just the final number.

### Flashcard direction

Front is the **description or scenario**; back is the **term, rule, or number**.
This matches the direction the exam tests. Do not generate term-first cards.

---

## Lesson view — four tabs

| Tab | Content |
|---|---|
| **Source** | `source_content`, verbatim, monospace-adjacent readable type. Untouched. |
| **Why This Matters** | Plain-language framing: what this is for, what it's testing, how it connects to other sections. |
| **Flashcards** | SRS review. Description → answer. |
| **Practice** | Questions with type badges (Factual / Scenario / Calculation), filterable by type. |

**Source is the fallback.** When a generated card feels wrong, the user checks it
against the original without leaving the app. `source_anchor` on any card or question
should link/scroll directly to the relevant part of the Source tab.

---

## Ingestion flow

Paste-driven, optimized for bulk entry:

1. User selects a section.
2. Pastes the lesson title + body.
3. App saves `source_content` immediately — **before** generation runs. The paste
   must never be lost to a failed API call.
4. Generation runs async; lesson shows a pending state.
5. Regenerate button per lesson, scoped to that lesson's cards and questions.

A "paste next lesson" affordance should keep the user in the flow — 59 lessons is a
lot of pasting and every extra click compounds.

---

## Gamification

**Weight progress by `exam_weight`, not lesson count.** Completing a Federal Laws
lesson must be worth more than a Uniform State Content lesson, because Federal Laws
is more than double the exam. Otherwise the user is rewarded for grinding the
cheapest section.

Progress display should show, per section: lessons done, cards due, accuracy over
last N attempts, and **estimated scored questions secured** (accuracy × section
question count). That last metric maps effort directly onto the 86-of-115 pass line.

Streaks and daily targets are welcome. Avoid anything that rewards speed over
accuracy — this exam punishes rushing.

---

## Design direction

**Warm, editorial, distraction-free.** Not game-y, not fintech-blue.

- Serif display face for headings; clean sans for body and UI
- Warm neutral paper background, not stark white or dark-mode-default
- A single warm accent (terracotta / clay range) used sparingly for emphasis
- Generous line height and measure on the Source tab — it's long-form legal text and
  will be read closely
- Type badges (Factual / Scenario / Calculation) should be quiet, not loud

The app should feel like a well-set study guide, not a quiz app.

---

## Known weak areas to prioritize

The user has already identified these as personally difficult. Surface them in review
scheduling:

- TRID fee tolerance buckets (0% / 10% cumulative / unlimited) — and the fact that the
  10% bucket is always tested as a **group**
- Changed circumstance validity — knowable-at-application vs. genuinely new information
- HOEPA (APOR + 6.5%) vs. HPML (APOR + 1.5%) thresholds
- QM safe harbor vs. rebuttable presumption bands
- FHA MIP duration rules vs. conventional PMI cancellation (original LTV vs. current LTV)

---

## Build order

1. Schema + migration + section seed
2. Paste/ingest flow with immediate `source_content` save
3. Lesson view with four tabs
4. Generation pipeline (questions before flashcards — questions are the higher-value
   output)
5. SRS scheduling
6. Weighted progress + gamification
