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

### Database setup

Run the migration once per Supabase project: open the Dashboard → **SQL
Editor**, paste the contents of `supabase/migrations/0001_init.sql`, and run
it. (Or, with the Supabase CLI linked to your project: `supabase db push`.)
It creates all tables with owner-only Row Level Security and a trigger that
auto-creates a `profiles` row for every new user.

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

## Smoke test (end-to-end, no browser)

Exercises the whole Phase 1 flow over HTTP against a running instance —
disposable user, fake-PDF CV parse, scripted interview (including a
deliberately vague answer to exercise the follow-up logic), both diagnostics,
diff assertions, approve/reject, final-state assertions, cleanup.

```bash
# .env.local additionally needs SUPABASE_SERVICE_ROLE_KEY
npm run dev     # terminal 1
npm run smoke   # terminal 2  (npm run smoke -- --keep retains the test user)
```

Notes: makes ~10-12 real AI calls per run; the test user is deleted at the
end (everything cascades), so your real data is untouched. Pipe failures fail
the run; model-quality judgments are reported as warnings.

## Environment variables

See `.env.example`. **Never put a real secret in any committed file.**
