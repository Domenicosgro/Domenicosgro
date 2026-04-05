-- ============================================================
-- DokuVault — Development Seed Data
-- ============================================================
-- Run ONLY in local development / staging environments.
-- Uses service role to bypass RLS.

-- Demo family
insert into public.families (id, name) values
  ('00000000-0000-0000-0000-000000000001', 'Mustermann Haushalt')
on conflict do nothing;

-- Note: auth.users rows must be created via Supabase Auth API (supabase auth admin createuser)
-- before inserting profiles. See README for dev setup instructions.
