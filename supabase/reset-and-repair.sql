-- ============================================================
-- Tether — RESET & REPAIR (run this whole file once in the
-- Supabase SQL editor; safe to re-run).
--
-- Diagnosis (2026-07-13): migration-02 was never applied to this
-- project — untether(), create_tether(), the safe join_tether(),
-- and the space_state (shared mood) table are all missing. This
-- file repairs everything, then WIPES ALL COUPLE DATA so you can
-- test fresh with your partner. Accounts survive (sign in as
-- usual, then pair again); uncomment the last block to delete
-- accounts as well.
-- ============================================================

-- ------------------------------------------------------------
-- PART 1 — REPAIR (everything migration-02 should have created)
-- ------------------------------------------------------------

-- Pairing: server-side code creation (reuses a pending code,
-- refuses when already paired).
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
  select * into t from public.tethers
   where (partner_a = auth.uid() or partner_b = auth.uid())
     and partner_b is not null
   limit 1;
  if found then return t; end if;

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

-- Pairing: safe join (no double-pairing, cleans the joiner's
-- leftover pending codes).
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
    return null;
  end if;
  if t.partner_a = auth.uid() then
    raise exception 'That is your own code — share it with your person instead.';
  end if;

  delete from public.tethers where partner_a = auth.uid() and partner_b is null;

  update public.tethers set partner_b = auth.uid() where id = t.id;
  return t.id;
end;
$$;

-- THE UNTETHER FIX — this function did not exist, so the button
-- silently did nothing.
create or replace function public.untether ()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.tethers
   where partner_a = auth.uid() or partner_b = auth.uid();
end;
$$;

-- Belt & suspenders: let members delete their own tether row
-- directly too (the app falls back to this if the RPC is absent).
drop policy if exists "members delete tether" on public.tethers;
create policy "members delete tether" on public.tethers
  for delete using (partner_a = auth.uid() or partner_b = auth.uid());

-- Instant chat default (letters used to wait 30 minutes).
alter table public.letters alter column unlock_at set default now();

-- Shared mood — this table was missing, so mood taps silently failed.
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

-- Blind-answer fix (re-assert; harmless if already applied).
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
-- PART 2 — RESET: wipe every couple's data for a fresh start.
-- Deleting tethers cascades letters, memories, daily questions,
-- answers, tokens, goals, mood, core heat, needle drops, and
-- last locations. Accounts/profiles are kept.
-- ------------------------------------------------------------

delete from public.tethers;

-- Clear uploaded photos (rows; wrapped in case of storage privileges —
-- if it errors as a NOTICE, empty the bucket via Dashboard → Storage).
do $$
begin
  delete from storage.objects where bucket_id = 'memories';
exception when insufficient_privilege then
  raise notice 'Could not clear storage here — empty the memories bucket in Dashboard > Storage.';
end $$;

-- ------------------------------------------------------------
-- OPTIONAL — also delete every account (both of you sign up
-- again from scratch). Uncomment to use.
-- ------------------------------------------------------------
-- delete from auth.users;

-- Make the new functions visible to the API immediately.
notify pgrst, 'reload schema';
