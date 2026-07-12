-- ============================================================
-- Tether — database schema, RLS, and RPCs
-- Run this in the Supabase SQL editor.
-- ============================================================

-- ---------- Tables ------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.tethers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  partner_a uuid not null references public.profiles (id) on delete cascade,
  partner_b uuid references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint different_partners check (partner_a <> partner_b)
);

create table if not exists public.letters (
  id uuid primary key default gen_random_uuid(),
  tether_id uuid not null references public.tethers (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  unlock_at timestamptz not null default now() + interval '30 minutes',
  created_at timestamptz not null default now()
);

create table if not exists public.memories (
  id uuid primary key default gen_random_uuid(),
  tether_id uuid not null references public.tethers (id) on delete cascade,
  uploader_id uuid not null references public.profiles (id) on delete cascade,
  storage_path text not null,
  caption text,
  rotation real not null default 0,
  hearted boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.daily_questions (
  id uuid primary key default gen_random_uuid(),
  tether_id uuid not null references public.tethers (id) on delete cascade,
  prompt text not null,
  for_date date not null default current_date,
  created_at timestamptz not null default now(),
  unique (tether_id, for_date)
);

create table if not exists public.question_answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.daily_questions (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  unique (question_id, author_id)
);

create table if not exists public.tokens (
  id uuid primary key default gen_random_uuid(),
  tether_id uuid not null references public.tethers (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  note text,
  redeemed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  tether_id uuid not null references public.tethers (id) on delete cascade,
  title text not null,
  target integer not null check (target > 0),
  progress integer not null default 0,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- Helper: membership check ------------------------

create or replace function public.is_tether_member (t uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tethers
    where id = t and (partner_a = auth.uid() or partner_b = auth.uid())
  );
$$;

-- ---------- Row Level Security -------------------------------

alter table public.profiles enable row level security;
alter table public.tethers enable row level security;
alter table public.letters enable row level security;
alter table public.memories enable row level security;
alter table public.daily_questions enable row level security;
alter table public.question_answers enable row level security;
alter table public.tokens enable row level security;
alter table public.goals enable row level security;

-- profiles: you manage yours; your partner can read yours.
create policy "own profile all" on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());
create policy "partner reads profile" on public.profiles
  for select using (
    exists (
      select 1 from public.tethers t
      where (t.partner_a = auth.uid() and t.partner_b = profiles.id)
         or (t.partner_b = auth.uid() and t.partner_a = profiles.id)
    )
  );

-- tethers: members read; creator inserts (joining happens via RPC).
create policy "members read tether" on public.tethers
  for select using (partner_a = auth.uid() or partner_b = auth.uid());
create policy "create tether" on public.tethers
  for insert with check (partner_a = auth.uid() and partner_b is null);

-- letters: members read/write within their tether.
create policy "letters select" on public.letters
  for select using (public.is_tether_member (tether_id));
create policy "letters insert" on public.letters
  for insert with check (public.is_tether_member (tether_id) and sender_id = auth.uid());

-- memories
create policy "memories select" on public.memories
  for select using (public.is_tether_member (tether_id));
create policy "memories insert" on public.memories
  for insert with check (public.is_tether_member (tether_id) and uploader_id = auth.uid());
create policy "memories update" on public.memories
  for update using (public.is_tether_member (tether_id));

-- daily questions & answers
create policy "questions select" on public.daily_questions
  for select using (public.is_tether_member (tether_id));
create policy "questions insert" on public.daily_questions
  for insert with check (public.is_tether_member (tether_id));
create policy "answers insert" on public.question_answers
  for insert with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.daily_questions q
      where q.id = question_id and public.is_tether_member (q.tether_id)
    )
  );
-- Blind answers: you can always read your own; you can only read your
-- partner's once you have answered the same question yourself.
create policy "answers select blind" on public.question_answers
  for select using (
    author_id = auth.uid()
    or exists (
      select 1 from public.question_answers mine
      where mine.question_id = question_answers.question_id
        and mine.author_id = auth.uid()
    )
  );

-- tokens: receiver redeems (update), members read, sender mints.
create policy "tokens select" on public.tokens
  for select using (public.is_tether_member (tether_id));
create policy "tokens insert" on public.tokens
  for insert with check (public.is_tether_member (tether_id) and sender_id = auth.uid());
create policy "tokens redeem" on public.tokens
  for update using (public.is_tether_member (tether_id) and sender_id <> auth.uid());

-- goals
create policy "goals select" on public.goals
  for select using (public.is_tether_member (tether_id));
create policy "goals insert" on public.goals
  for insert with check (public.is_tether_member (tether_id));
create policy "goals update" on public.goals
  for update using (public.is_tether_member (tether_id));

-- ---------- RPC: join a tether by one-time code --------------

create or replace function public.join_tether (join_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.tethers;
begin
  select * into t from public.tethers
   where code = join_code and partner_b is null and partner_a <> auth.uid()
   for update;
  if not found then
    return null;
  end if;
  update public.tethers set partner_b = auth.uid() where id = t.id;
  return t.id;
end;
$$;

-- ---------- RPC: atomic goal increment ------------------------

create or replace function public.increment_goal (goal_id uuid, amount integer default 1)
returns public.goals
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.goals;
begin
  update public.goals gl
     set progress = least(gl.target, gl.progress + amount),
         completed_at = case
           when gl.progress + amount >= gl.target and gl.completed_at is null then now()
           else gl.completed_at
         end
   where gl.id = goal_id and public.is_tether_member (gl.tether_id)
   returning gl.* into g;
  return g;
end;
$$;

-- ---------- Storage: memories bucket -------------------------

insert into storage.buckets (id, name, public)
values ('memories', 'memories', true)
on conflict (id) do nothing;

create policy "memories upload" on storage.objects
  for insert with check (
    bucket_id = 'memories'
    and public.is_tether_member ((split_part(name, '/', 1))::uuid)
  );
create policy "memories read" on storage.objects
  for select using (bucket_id = 'memories');

-- ---------- Realtime ------------------------------------------

alter publication supabase_realtime add table public.tethers;
alter publication supabase_realtime add table public.letters;
alter publication supabase_realtime add table public.memories;
alter publication supabase_realtime add table public.question_answers;
alter publication supabase_realtime add table public.tokens;
alter publication supabase_realtime add table public.goals;
