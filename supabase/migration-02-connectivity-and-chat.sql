-- ============================================================
-- Tether — Migration 02: pairing reliability, bridge RLS fix,
-- instant chat, shared space (mood), housekeeping.
-- Safe to run on top of schema.sql (idempotent).
-- ============================================================

-- ------------------------------------------------------------
-- 1) BRIDGE FIX — the "blind answer" policy referenced its own
--    table, which Postgres rejects as infinite recursion, making
--    every select on question_answers fail. Break the cycle with
--    a SECURITY DEFINER helper.
-- ------------------------------------------------------------

create or replace function public.has_answered (qid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.question_answers
    where question_id = qid and author_id = auth.uid()
  );
$$;

drop policy if exists "answers select blind" on public.question_answers;
create policy "answers select blind" on public.question_answers
  for select using (
    author_id = auth.uid() or public.has_answered (question_id)
  );

-- ------------------------------------------------------------
-- 2) PAIRING RELIABILITY
--    - create_tether(): server-side, reuses your pending code,
--      deletes duplicates, refuses if already paired.
--    - join_tether(): refuses double-pairing, deletes the
--      joiner's own leftover pending codes, clear errors.
--    - untether(): clean escape hatch for stuck states.
-- ------------------------------------------------------------

create or replace function public.create_tether ()
returns public.tethers
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.tethers;
  new_code text;
  words text[] := array['EMBER','BLUSH','DUSK','VELVET','AMBER','MOTH','PLUM','WREN'];
begin
  -- already in a completed pair? return it, never make a second one.
  select * into t from public.tethers
   where (partner_a = auth.uid() or partner_b = auth.uid())
     and partner_b is not null
   limit 1;
  if found then return t; end if;

  -- reuse an existing pending code and drop any duplicates.
  select * into t from public.tethers
   where partner_a = auth.uid() and partner_b is null
   order by created_at desc limit 1;
  if found then
    delete from public.tethers
     where partner_a = auth.uid() and partner_b is null and id <> t.id;
    return t;
  end if;

  loop
    new_code := words[1 + floor(random() * array_length(words, 1))::int]
                || '-' || lpad(floor(random() * 10000)::text, 4, '0');
    exit when not exists (select 1 from public.tethers where code = new_code);
  end loop;

  insert into public.tethers (code, partner_a)
  values (new_code, auth.uid())
  returning * into t;
  return t;
end;
$$;

create or replace function public.join_tether (join_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.tethers;
begin
  if exists (
    select 1 from public.tethers
    where (partner_a = auth.uid() or partner_b = auth.uid())
      and partner_b is not null
  ) then
    raise exception 'You are already tethered. Untether first.';
  end if;

  select * into t from public.tethers
   where code = upper(trim(join_code)) and partner_b is null
   for update;

  if not found then
    return null; -- unknown or already-used code; client shows a soft error
  end if;
  if t.partner_a = auth.uid() then
    raise exception 'That is your own code — share it with your person instead.';
  end if;

  -- the joiner's own leftover pending codes would create ghost states.
  delete from public.tethers where partner_a = auth.uid() and partner_b is null;

  update public.tethers set partner_b = auth.uid() where id = t.id;
  return t.id;
end;
$$;

create or replace function public.untether ()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Cascades to letters/memories/questions/tokens/goals via FKs.
  delete from public.tethers
   where partner_a = auth.uid() or partner_b = auth.uid();
end;
$$;

-- ------------------------------------------------------------
-- 3) LETTERS → INSTANT CHAT: messages no longer wait 30 minutes.
-- ------------------------------------------------------------

alter table public.letters alter column unlock_at set default now();

-- ------------------------------------------------------------
-- 4) SHARED SPACE — one mood per couple, realtime-synced; tints
--    the ambient background for both partners.
-- ------------------------------------------------------------

create table if not exists public.space_state (
  tether_id uuid primary key references public.tethers (id) on delete cascade,
  mood text not null default 'calm',
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);

alter table public.space_state enable row level security;

drop policy if exists "space select" on public.space_state;
create policy "space select" on public.space_state
  for select using (public.is_tether_member (tether_id));
drop policy if exists "space insert" on public.space_state;
create policy "space insert" on public.space_state
  for insert with check (public.is_tether_member (tether_id));
drop policy if exists "space update" on public.space_state;
create policy "space update" on public.space_state
  for update using (public.is_tether_member (tether_id));

do $$
begin
  alter publication supabase_realtime add table public.space_state;
exception when duplicate_object then null;
end $$;
