-- ============================================================
-- Tether — Migration 04: re-assert the Question Bridge fix.
-- Run this if partner answers don't reveal after both answered:
-- the original "blind answer" policy referenced its own table,
-- which Postgres rejects as infinite recursion. Idempotent.
-- ============================================================

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

-- make sure answer inserts stream to the partner in realtime
do $$
begin
  alter publication supabase_realtime add table public.question_answers;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.daily_questions;
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
