-- ============================================================
-- DokuVault — Row Level Security Policies
-- Migration: 002_rls_policies.sql
-- ============================================================

-- ─── Enable RLS ──────────────────────────────────────────────────────────────
alter table public.families       enable row level security;
alter table public.profiles       enable row level security;
alter table public.documents      enable row level security;
alter table public.document_dates enable row level security;

-- ─── Helper: current user's family_id ────────────────────────────────────────
create or replace function public.my_family_id()
returns uuid language sql stable security definer as $$
  select family_id from public.profiles where id = auth.uid();
$$;

-- ─── families ─────────────────────────────────────────────────────────────────
-- Members can read their own family
create policy "families: read own"
  on public.families for select
  using (id = public.my_family_id());

-- Only server-side (service role) can insert families
-- (done automatically via handle_new_user trigger with security definer)

-- ─── profiles ─────────────────────────────────────────────────────────────────
-- Read: all members of the same family
create policy "profiles: read same family"
  on public.profiles for select
  using (family_id = public.my_family_id());

-- Update: only own profile
create policy "profiles: update own"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- Insert: only own profile (matches auth.uid)
create policy "profiles: insert own"
  on public.profiles for insert
  with check (id = auth.uid());

-- ─── documents ────────────────────────────────────────────────────────────────
-- Read: any family member
create policy "documents: read family"
  on public.documents for select
  using (family_id = public.my_family_id());

-- Insert: any authenticated family member
create policy "documents: insert family"
  on public.documents for insert
  with check (
    family_id = public.my_family_id()
    and uploaded_by = auth.uid()
  );

-- Update: only the uploader OR any family member can update analysis fields
-- (analysis can be updated by backend service role — bypasses RLS)
create policy "documents: update own"
  on public.documents for update
  using (family_id = public.my_family_id())
  with check (family_id = public.my_family_id());

-- Delete: only the uploader
create policy "documents: delete own"
  on public.documents for delete
  using (uploaded_by = auth.uid());

-- ─── document_dates ───────────────────────────────────────────────────────────
-- Read: any family member
create policy "document_dates: read family"
  on public.document_dates for select
  using (family_id = public.my_family_id());

-- Insert: any family member (usually done server-side after analysis)
create policy "document_dates: insert family"
  on public.document_dates for insert
  with check (family_id = public.my_family_id());

-- Update: any family member (e.g. to mark calendar_synced)
create policy "document_dates: update family"
  on public.document_dates for update
  using (family_id = public.my_family_id())
  with check (family_id = public.my_family_id());

-- Delete: any family member
create policy "document_dates: delete family"
  on public.document_dates for delete
  using (family_id = public.my_family_id());

-- ─── Storage bucket policies ──────────────────────────────────────────────────
-- Run after creating the 'documents' bucket in Supabase dashboard

-- Allow family members to read files in their family folder
create policy "storage: read family files"
  on storage.objects for select
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = public.my_family_id()::text
  );

-- Allow family members to upload to their family folder
create policy "storage: insert family files"
  on storage.objects for insert
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = public.my_family_id()::text
  );

-- Allow family members to delete their own uploads
create policy "storage: delete family files"
  on storage.objects for delete
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = public.my_family_id()::text
  );
