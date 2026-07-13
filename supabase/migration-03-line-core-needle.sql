-- ============================================================
-- Tether — Migration 03: The Tether Line, The Resonance Core,
-- The Needle Drop, wall photo deletion.
-- Run after migration-02. Idempotent.
-- ============================================================

-- ------------------------------------------------------------
-- 1) WALL: allow deleting memories (row + stored file)
-- ------------------------------------------------------------

drop policy if exists "memories delete" on public.memories;
create policy "memories delete" on public.memories
  for delete using (public.is_tether_member (tether_id));

-- Storage policies can require table ownership on some projects; never let
-- that abort the rest of this migration. If you see the NOTICE below,
-- add the delete policy via Dashboard → Storage → memories → Policies.
do $$
begin
  drop policy if exists "memories storage delete" on storage.objects;
  create policy "memories storage delete" on storage.objects
    for delete using (
      bucket_id = 'memories'
      and public.is_tether_member ((split_part(name, '/', 1))::uuid)
    );
exception when insufficient_privilege then
  raise notice 'Could not create the storage delete policy here — add it in Dashboard > Storage > Policies (DELETE on bucket memories).';
end $$;

-- ------------------------------------------------------------
-- 2) TETHER LINE: last known location per partner (compass anchor)
-- ------------------------------------------------------------

create table if not exists public.last_locations (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  tether_id uuid not null references public.tethers (id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  updated_at timestamptz not null default now()
);

alter table public.last_locations enable row level security;

drop policy if exists "locations select" on public.last_locations;
create policy "locations select" on public.last_locations
  for select using (public.is_tether_member (tether_id));
drop policy if exists "locations upsert" on public.last_locations;
create policy "locations upsert" on public.last_locations
  for insert with check (user_id = auth.uid() and public.is_tether_member (tether_id));
drop policy if exists "locations update" on public.last_locations;
create policy "locations update" on public.last_locations
  for update using (user_id = auth.uid());

-- ------------------------------------------------------------
-- 3) RESONANCE CORE: shared heat, lazily decayed (no cron needed:
--    decay is a pure function of last_interaction_at, applied on
--    every read/write — identical behavior, zero infrastructure).
--    Rate: 2 heat per hour → full crystallization ~2 days.
-- ------------------------------------------------------------

create table if not exists public.tether_core (
  tether_id uuid primary key references public.tethers (id) on delete cascade,
  heat_level integer not null default 50 check (heat_level between 0 and 100),
  last_interaction_at timestamptz not null default now()
);

alter table public.tether_core enable row level security;

drop policy if exists "core select" on public.tether_core;
create policy "core select" on public.tether_core
  for select using (public.is_tether_member (tether_id));

create or replace function public.add_heat (t uuid, amount integer)
returns public.tether_core
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.tether_core;
  decayed integer;
begin
  if not public.is_tether_member (t) then
    raise exception 'Not a member of this tether.';
  end if;

  insert into public.tether_core (tether_id)
  values (t)
  on conflict (tether_id) do nothing;

  select * into c from public.tether_core where tether_id = t for update;

  -- lazy decay: 2 heat/hour since the last interaction
  decayed := greatest(0, c.heat_level
    - floor(extract(epoch from (now() - c.last_interaction_at)) / 1800)::int);

  update public.tether_core
     set heat_level = least(100, greatest(0, decayed + amount)),
         last_interaction_at = now()
   where tether_id = t
   returning * into c;
  return c;
end;
$$;

-- ------------------------------------------------------------
-- 4) NEEDLE DROP: exactly one active song per couple; after it
--    plays, the turntable rests until the next day.
-- ------------------------------------------------------------

create table if not exists public.needle_drops (
  id uuid primary key default gen_random_uuid(),
  tether_id uuid not null references public.tethers (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  track_name text not null,
  artist_name text not null,
  artwork_url text,
  preview_url text,
  status text not null default 'waiting' check (status in ('waiting', 'played')),
  created_at timestamptz not null default now(),
  played_at timestamptz
);

create unique index if not exists one_waiting_drop_per_tether
  on public.needle_drops (tether_id) where (status = 'waiting');

alter table public.needle_drops enable row level security;

drop policy if exists "drops select" on public.needle_drops;
create policy "drops select" on public.needle_drops
  for select using (public.is_tether_member (tether_id));

create or replace function public.send_needle_drop (
  t uuid, track text, artist text, artwork text, preview text
)
returns public.needle_drops
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.needle_drops;
begin
  if not public.is_tether_member (t) then
    raise exception 'Not a member of this tether.';
  end if;
  if exists (select 1 from public.needle_drops where tether_id = t and status = 'waiting') then
    raise exception 'A record is already on its way.';
  end if;
  if exists (
    select 1 from public.needle_drops
    where tether_id = t and status = 'played' and played_at::date = current_date
  ) then
    raise exception 'The turntable is resting until tomorrow.';
  end if;

  insert into public.needle_drops (tether_id, sender_id, track_name, artist_name, artwork_url, preview_url)
  values (t, auth.uid(), track, artist, artwork, preview)
  returning * into d;
  return d;
end;
$$;

create or replace function public.play_needle_drop (drop_id uuid)
returns public.needle_drops
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.needle_drops;
begin
  update public.needle_drops nd
     set status = 'played', played_at = now()
   where nd.id = drop_id
     and nd.status = 'waiting'
     and nd.sender_id <> auth.uid()          -- only the receiver drops the needle
     and public.is_tether_member (nd.tether_id)
   returning nd.* into d;
  if d.id is null then
    raise exception 'This record cannot be played.';
  end if;
  return d;
end;
$$;

-- ------------------------------------------------------------
-- 5) Realtime
-- ------------------------------------------------------------

do $$
begin
  alter publication supabase_realtime add table public.tether_core;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.needle_drops;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.last_locations;
exception when duplicate_object then null;
end $$;

-- Refresh PostgREST's schema cache immediately so the new RPCs
-- (send_needle_drop, play_needle_drop, add_heat) resolve without a restart.
notify pgrst, 'reload schema';
