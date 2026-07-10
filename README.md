# EGOS

> "ChatGPT answers you; EGOS tracks you."

AI career coach with persistent, structured state: users onboard with a CV and
goals, get an evidence-based skill baseline, and (in later phases) a 12-week
roadmap with a weekly coached loop.

## Stack

- **Next.js** (App Router, TypeScript) + Tailwind CSS
- **Supabase** — Postgres + magic-link auth (no passwords)
- **Anthropic API** — all AI calls go through a provider adapter
  (`lib/ai/provider.ts`); the model name comes from the `AI_MODEL` env var
- Deployed on **Vercel**

## Privacy: CV parse-and-discard (KVKK)

Uploaded CV PDFs are **processed transiently and never persisted**. The file is
sent to the AI for parsing in-memory and discarded immediately afterwards —
it is not written to disk, object storage, or the database. The only stored
artifact is the structured profile (`profiles.cv_json`) **after the user has
reviewed, edited, and confirmed it**. This minimizes the personal data we hold
(KVKK / GDPR data-minimization principle): we keep only what the user
explicitly approved, in a form they can inspect and edit at any time.

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a [Supabase](https://supabase.com) project, then copy the env
   template and fill in real values (never commit `.env.local` — the repo's
   `.gitignore` already excludes all `.env*` files):

   ```bash
   cp .env.example .env.local
   ```

3. Run the dev server:

   ```bash
   npm run dev
   ```

4. Open http://localhost:3000

### Supabase auth configuration

In the Supabase Dashboard → **Authentication → URL Configuration**, add:

- Site URL: `http://localhost:3000` (your Vercel URL in production)
- Redirect URL: `http://localhost:3000/auth/callback`

## Project structure

```
app/            pages + API routes (App Router)
lib/supabase/   Supabase client/server/middleware helpers
lib/ai/         provider adapter, state compiler, kernel prompts (Milestone 3+)
supabase/       SQL migrations (Milestone 2+)
```

## Environment variables

See `.env.example`. **Never put a real secret in any committed file.**
