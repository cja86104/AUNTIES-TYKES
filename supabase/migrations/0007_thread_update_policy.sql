-- ============================================================================
-- Let a parent bump their own thread.
--
-- Replying runs two writes: the thread row (so updated_at moves and the owner's
-- inbox sorts correctly), then the message row. The thread write is an upsert,
-- which on an existing row becomes INSERT ... ON CONFLICT DO UPDATE — and
-- Postgres then requires an UPDATE policy, not just the INSERT one.
--
-- public.threads had own_threads_select and own_threads_insert but no UPDATE
-- policy, so a parent's reply failed at the first write and the message that
-- followed it never ran. Replies from the parent portal did not save at all.
--
-- Scoped to their own family both ways: `using` decides which row they may
-- touch, `with check` stops them handing the thread to another family.
-- ============================================================================

drop policy if exists own_threads_update on public.threads;

create policy own_threads_update on public.threads
  for update to authenticated
  using (family_id = public.current_family_id())
  with check (family_id = public.current_family_id());
