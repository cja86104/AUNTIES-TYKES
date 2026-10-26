-- ============================================================================
-- 0025 — "Keep visible" for documents on the admin side.
--
-- The admin Documents page now starts fresh every Monday: it opens on the
-- current week (Mon–Sun, Eastern) and earlier weeks are a step back or a
-- search away (src/lib/weeks.ts). Nothing is moved or deleted for that, and
-- the family portal is unchanged — it still lists every document shared with
-- the family.
--
-- Evergreen files (the handbook, policies, the enrollment packet) should not
-- roll off her week, so the owner can pin a document. A pinned document shows
-- on every week's view in the console. `pinned` affects the admin view only;
-- it changes nothing about who can see the document.
--
-- Pinning is the owner's choice alone. The parent insert policy from 0006 is
-- recreated with one added line, `and not pinned`, so a family's upload cannot
-- pin itself onto her console. Every other condition is unchanged. Parents
-- still have no update policy on this table.
--
-- Additive only, on live data: every existing document starts unpinned.
-- Idempotent: safe to run more than once.
-- ============================================================================

alter table public.documents
  add column if not exists pinned boolean not null default false;

drop policy if exists parent_upload_document on public.documents;

create policy parent_upload_document on public.documents
  for insert to authenticated
  with check (
    uploaded_by_id = auth.uid()
    and not visible_to_parents
    and not requires_ack
    and not pinned
    and public.current_family_id() is not null
    and (
      storage_path is null
      or storage_path like 'family/' || public.current_family_id() || '/%'
    )
  );
