-- EGOS — initial schema (Phase 1: walking skeleton)
-- `users` is Supabase's built-in auth.users; every table references it.
-- All tables are owner-only via RLS: a user can only touch rows where
-- user_id = auth.uid(). The Anthropic-facing API routes additionally verify
-- the session server-side before doing anything.

-- ────────────────────────────────────────────────────────────────────
-- profiles: one row per user; cv_json is the user-confirmed parse result
-- (the original PDF is never persisted — parse-and-discard, see README)
-- ────────────────────────────────────────────────────────────────────
create table public.profiles (
  user_id         uuid primary key references auth.users (id) on delete cascade,
  cv_json         jsonb,
  goals           jsonb,
  priorities      jsonb,
  cv_source       text check (cv_source in ('parsed', 'manual')),
  onboarding_step text not null default 'cv',
  locale          text not null default 'tr',
  updated_at      timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────────────
-- sessions: one row per AI interaction unit; kernel_version stamps which
-- prompt version produced it (lib/ai/kernel KERNEL_VERSION)
-- ────────────────────────────────────────────────────────────────────
create table public.sessions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  kind           text not null check (kind in ('onboarding_interview', 'diagnostic', 'coaching', 'retro')),
  kernel_version text not null,
  status         text not null default 'active' check (status in ('active', 'completed', 'abandoned')),
  metadata       jsonb not null default '{}',
  started_at     timestamptz not null default now(),
  completed_at   timestamptz
);

-- ────────────────────────────────────────────────────────────────────
-- skills: the matrix. Anti-sycophancy is enforced at the schema level:
-- a score cannot exist without evidence.
-- Rubric: 1 Aware, 2 Practitioner, 3 Independent, 4 Advanced, 5 Executive.
-- ────────────────────────────────────────────────────────────────────
create table public.skills (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  domain           text not null,
  category         text not null,
  name             text not null,
  score            smallint check (score between 1 and 5),
  provisional      boolean not null default true,
  evidence         text,
  counter_argument text,
  self_rating      smallint check (self_rating between 1 and 5),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, domain, name),
  -- no score without evidence
  constraint score_requires_evidence check (score is null or evidence is not null)
);

create table public.skill_history (
  id             uuid primary key default gen_random_uuid(),
  skill_id       uuid not null references public.skills (id) on delete cascade,
  user_id        uuid not null references auth.users (id) on delete cascade,
  old_score      smallint,
  new_score      smallint,
  evidence       text,
  source_session uuid references public.sessions (id) on delete set null,
  created_at     timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────────────
-- messages: transcript ARCHIVE only. Never used as AI memory — prompts are
-- compiled from structured state (profiles, skills, …), not from here.
-- ────────────────────────────────────────────────────────────────────
create table public.messages (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null check (role in ('user', 'assistant', 'system')),
  content    text not null,
  created_at timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────────────
-- state_diffs: approval flow. AI outputs that would change state land here
-- as validated JSON and are applied only after the user approves.
-- ────────────────────────────────────────────────────────────────────
create table public.state_diffs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  session_id   uuid references public.sessions (id) on delete set null,
  target_table text not null,
  target_id    uuid,
  diff         jsonb not null,
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  resolved_at  timestamptz,
  created_at   timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────────────
-- decisions: the calibration loop. User records a decision + forecast;
-- when review_date arrives it matures, gets scored against the outcome,
-- and produces a lesson.
-- ────────────────────────────────────────────────────────────────────
create table public.decisions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  session_id       uuid references public.sessions (id) on delete set null,
  title            text not null,
  context          jsonb,
  forecast_text    text,
  probability      numeric check (probability >= 0 and probability <= 1),
  reversibility    text check (reversibility in ('one-way', 'two-way')),
  review_date      date,
  status           text not null default 'active' check (status in ('active', 'matured', 'scored')),
  outcome          text,
  calibration_note text,
  lesson           text,
  created_at       timestamptz not null default now()
);

create table public.insights (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  session_id uuid references public.sessions (id) on delete set null,
  kind       text not null,
  content    text not null,
  created_at timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────────────
-- plans + plan_items: created now so the Phase 2 roadmap fits without a
-- schema rewrite; nothing in Phase 1 writes to them.
-- plan_items models roadmap tasks. The spaced-repetition drill queue is a
-- DIFFERENT concept with its own lifecycle (concept, interval stage,
-- last_score, next_review) and will get its own drill_items table in Phase 2.
-- ────────────────────────────────────────────────────────────────────
create table public.plans (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  kind       text not null default 'roadmap' check (kind in ('roadmap')),
  content    jsonb not null default '{}',
  version    integer not null default 1,
  status     text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  created_at timestamptz not null default now()
);

create table public.plan_items (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  plan_id    uuid not null references public.plans (id) on delete cascade,
  week       integer,
  kind       text not null,
  content    jsonb not null default '{}',
  status     text not null default 'pending',
  due_at     timestamptz,
  created_at timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────────────
-- Indexes for the common lookups
-- ────────────────────────────────────────────────────────────────────
create index skills_user_idx on public.skills (user_id);
create index skill_history_skill_idx on public.skill_history (skill_id);
create index sessions_user_idx on public.sessions (user_id, status);
create index messages_session_idx on public.messages (session_id);
create index state_diffs_user_status_idx on public.state_diffs (user_id, status);
create index decisions_user_idx on public.decisions (user_id, status);
create index insights_user_idx on public.insights (user_id);
create index plan_items_plan_idx on public.plan_items (plan_id);

-- ────────────────────────────────────────────────────────────────────
-- updated_at maintenance
-- ────────────────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger skills_updated_at before update on public.skills
  for each row execute function public.set_updated_at();

-- ────────────────────────────────────────────────────────────────────
-- Row Level Security: owner-only on every table
-- ────────────────────────────────────────────────────────────────────
alter table public.profiles      enable row level security;
alter table public.sessions      enable row level security;
alter table public.skills        enable row level security;
alter table public.skill_history enable row level security;
alter table public.messages      enable row level security;
alter table public.state_diffs   enable row level security;
alter table public.decisions     enable row level security;
alter table public.insights      enable row level security;
alter table public.plans         enable row level security;
alter table public.plan_items    enable row level security;

create policy "own rows" on public.profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on public.sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on public.skills
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on public.skill_history
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on public.messages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on public.state_diffs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on public.decisions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on public.insights
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on public.plans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on public.plan_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────────────
-- Auto-create a profile row when a user signs up
-- ────────────────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
