-- ============================================================================
-- Real file storage for documents.
--
-- Until now FileUploader simulated a progress bar and threw the file away.
-- This creates the bucket and the policies; the app change makes it upload.
--
-- The bucket is PRIVATE. These are handbooks, signed forms and immunisation
-- records carrying children's and families' names — a public bucket means
-- anyone who ever sees a URL keeps access to that file forever. Downloads go
-- through short-lived signed URLs instead.
--
-- Path convention, which the policies below depend on:
--   admin/<random>/<filename>             uploaded by the owner
--   family/<familyId>/<random>/<filename> uploaded by a parent
--
-- The random segment only keeps two files of the same name apart; nothing
-- reads it. Only the leading prefix carries meaning, and the policies below
-- are the only thing that grants access.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,
  10485760, -- 10 MB
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic'
  ]
)
on conflict (id) do update set
  public             = false,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ------------------------------- policies -----------------------------------
-- Supabase ships storage.objects with RLS already enabled.

drop policy if exists documents_admin_all      on storage.objects;
drop policy if exists documents_parent_read    on storage.objects;
drop policy if exists documents_parent_upload  on storage.objects;

create policy documents_admin_all on storage.objects
  for all to authenticated
  using (bucket_id = 'documents' and public.is_admin())
  with check (bucket_id = 'documents' and public.is_admin());

-- A parent may read two things: files under their own family's prefix, and
-- files attached to a document the owner marked visible to parents. The join
-- on documents.storage_path is what keeps an unshared handbook unreadable
-- even if someone guesses the object name.
create policy documents_parent_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and (
      name like 'family/' || public.current_family_id() || '/%'
      or exists (
        select 1 from public.documents d
        where d.storage_path = storage.objects.name
          and d.visible_to_parents
      )
    )
  );

-- Parents write only inside their own family's prefix. Without this a parent
-- could upload into another family's folder, or over an admin file.
create policy documents_parent_upload on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents'
    and public.current_family_id() is not null
    and name like 'family/' || public.current_family_id() || '/%'
  );


-- --------------------------- documents table row ----------------------------
-- The storage policies above let a parent put a FILE in their own folder, but
-- public.documents had only admin_all for writes, so the ROW that points at it
-- was rejected by RLS. A parent upload needs both halves to land.
--
-- Deliberately narrow: a parent may create their own upload and nothing else.
-- visible_to_parents stays false, or one family could publish a document into
-- every other family's portal; the storage_path must sit under their own
-- prefix, so a row cannot be pointed at somebody else's file. No update or
-- delete policy — parents do not edit or remove documents.

drop policy if exists parent_upload_document on public.documents;

create policy parent_upload_document on public.documents
  for insert to authenticated
  with check (
    uploaded_by_id = auth.uid()
    and not visible_to_parents
    and not requires_ack
    and public.current_family_id() is not null
    and (
      storage_path is null
      or storage_path like 'family/' || public.current_family_id() || '/%'
    )
  );
