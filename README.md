# MLO Study

A mobile-first NMLS Mortgage Loan Originator exam prep app with three study modes, spaced-repetition flashcards, and a gamification layer to keep you motivated through a two-week cram.

## Features

- **Learn** — browse modules/lessons with markdown rendering, mark lessons as read, prev/next navigation
- **Flashcards** — tap-to-flip cards with a 5-box Leitner spaced-repetition system; "Got it / Review Again" buttons; cards due count
- **Practice** — multiple-choice quizzes with immediate feedback and explanations; per-module or all-modules filter
- **Gamification** — XP, levels, daily streak, 14 achievement badges, per-module mastery %, daily goal ring
- **Auth** — magic-link (passwordless) email sign-in via Supabase; all progress syncs across devices

## Tech Stack

- [Next.js 16](https://nextjs.org) (App Router + TypeScript)
- [Tailwind CSS v4](https://tailwindcss.com)
- [Supabase](https://supabase.com) — Auth + Postgres with Row Level Security
- Deploy target: [Vercel](https://vercel.com)

---

## Local Development

### 1. Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project (free tier is fine)

### 2. Clone & install

```bash
git clone <your-repo-url>
cd php-courses-3000
npm install
```

### 3. Set up the database

In the Supabase dashboard → **SQL Editor**, paste and run the contents of:

```
supabase/migrations/001_initial_schema.sql
```

This creates all tables, RLS policies, and the auto-profile trigger.

### 4. Configure environment variables

```bash
cp .env.local.example .env.local
```

Edit `.env.local` and fill in your Supabase project values (found in **Project Settings → API**):

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

> `.env.local` is gitignored and never committed.

### 5. Configure Supabase Auth

In the Supabase dashboard → **Authentication → URL Configuration**:

- **Site URL**: `http://localhost:3000`
- **Redirect URLs**: add `http://localhost:3000/auth/callback`

### 6. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You'll be prompted to sign in with a magic link.

---

## Deploying to Vercel

### 1. Push to GitHub

```bash
git add .
git commit -m "initial commit"
git push
```

### 2. Import into Vercel

1. Go to [vercel.com/new](https://vercel.com/new) and import your repo
2. Framework preset: **Next.js** (auto-detected)

### 3. Add Environment Variables

In Vercel → **Project Settings → Environment Variables**, add:

| Key | Value |
|-----|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon public key |

### 4. Update Supabase redirect URLs

In Supabase → **Authentication → URL Configuration**:

- **Site URL**: `https://your-app.vercel.app`
- **Redirect URLs**: add `https://your-app.vercel.app/auth/callback`

### 5. Deploy

Click **Deploy**. Vercel will build and deploy automatically on every push to main.

---

## Adding New Modules

All study content lives in [`/content`](/content) as static TypeScript — no database involved.

1. Create `/content/mod-N.ts` following the same shape as [`/content/mod-1.ts`](/content/mod-1.ts):
   - `module` with `id`, `title`, `description`, and `lessons[]`
   - `flashcards[]` — each with `id`, `moduleId`, `question`, `answer`
   - `quizQuestions[]` — each with `id`, `moduleId`, `prompt`, `choices[]`, `correctIndex`, `explanation`

2. Import and add it to the `allContent` array in [`/content/index.ts`](/content/index.ts).

That's it — the module will appear in all three study modes immediately.

---

## Project Structure

```
app/
  page.tsx                        # Home dashboard
  sign-in/page.tsx                # Magic-link sign-in
  auth/callback/route.ts          # Supabase auth callback
  learn/page.tsx                  # Module list
  learn/[moduleId]/[lessonId]/    # Lesson viewer
  flashcards/page.tsx             # Leitner flashcard session
  practice/page.tsx               # Multiple-choice quiz

content/                          # Static study content (types + seed data)
components/                       # Shared UI components
hooks/                            # Data-fetching hooks (Supabase + optimistic updates)
lib/
  db.ts                           # Typed data-access layer (all Supabase calls)
  gamification.ts                 # XP, levels, streaks, achievements
  leitner.ts                      # Spaced-repetition scheduling
  db-types.ts                     # TypeScript types for DB schema
utils/supabase/
  client.ts                       # Browser Supabase client
  server.ts                       # Server-side Supabase client (cookies)
supabase/migrations/              # SQL migration files
middleware.ts                     # Auth protection + session refresh
```
