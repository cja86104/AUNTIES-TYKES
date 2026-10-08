-- ============================================================================
-- Photo and PDF attachments on a daily report's note home.
--
-- Reuses the private `documents` bucket and the `admin/<random>/<filename>`
-- upload path from 0006_document_storage.sql — nothing new to provision.
--
-- The files themselves are listed on the report row, in `attachments`, as
-- [{ "storagePath": "...", "fileName": "...", "size": 123 }, ...].
--
-- What's missing is a way for a PARENT to read an object under the admin/
-- prefix: documents_parent_read (0006) only grants that through
-- public.documents, and announcements_attachment_read (0011) only through
-- public.announcements. This adds the same kind of policy for daily reports:
-- a parent can read a file only while it is listed on a report for a child in
-- their own family. Delete the report, or take the file off it, and the
-- parent's access goes with it.
-- ============================================================================

alter table public.daily_logs
  add column if not exists attachments jsonb not null default '[]'::jsonb;

drop policy if exists daily_log_attachment_read on storage.objects;

create policy daily_log_attachment_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and name like 'admin/%'
    and exists (
      select 1
      from public.daily_logs l
      join public.children c on c.id = l.child_id
      where c.family_id = public.current_family_id()
        and l.attachments @> jsonb_build_array(jsonb_build_object('storagePath', storage.objects.name))
    )
  );
