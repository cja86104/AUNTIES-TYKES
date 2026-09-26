-- ============================================================================
-- One optional file attachment per announcement.
--
-- Reuses the private `documents` bucket and the existing `admin/<random>/
-- <filename>` upload path from 0006_document_storage.sql — nothing new to
-- provision there. What's missing is a way for a PARENT to read an object
-- under that admin/ prefix: documents_parent_read (0006) only grants that via
-- a join against public.documents, which an announcement's file is not.
--
-- This adds the three attachment columns and a matching storage read policy
-- that joins against public.announcements instead, gated by the same
-- audience rule as visible_announcements (0001_init.sql) so a family-only
-- announcement's attachment stays scoped to that family.
-- ============================================================================

alter table public.announcements
  add column if not exists attachment_storage_path text,
  add column if not exists attachment_file_name text,
  add column if not exists attachment_size bigint;

drop policy if exists announcements_attachment_read on storage.objects;

create policy announcements_attachment_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and exists (
      select 1 from public.announcements a
      where a.attachment_storage_path = storage.objects.name
        and (a.audience_family_id is null or a.audience_family_id = public.current_family_id())
    )
  );
