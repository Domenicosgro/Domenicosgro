-- ============================================================
-- DokuVault — Initial Schema
-- Migration: 001_initial_schema.sql
-- ============================================================

-- ─── Extensions ──────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm";     -- trigram similarity for full-text search
create extension if not exists "unaccent";    -- accent-insensitive search

-- ─── Custom Types ─────────────────────────────────────────────────────────────
create type analysis_status as enum ('pending', 'processing', 'done', 'error');
create type date_priority    as enum ('urgent', 'high', 'medium', 'low');
create type document_category as enum (
  'rechnung',     -- Invoice
  'vertrag',      -- Contract
  'bescheid',     -- Official notice
  'versicherung', -- Insurance
  'steuer',       -- Tax
  'bank',         -- Banking
  'gesundheit',   -- Health / medical
  'behoerde',     -- Government / authority
  'schule',       -- School / education
  'wohnen',       -- Housing / rent
  'arbeit',       -- Employment
  'sonstiges'     -- Other
);

-- ─── families ─────────────────────────────────────────────────────────────────
create table public.families (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  created_at  timestamptz not null default now()
);

comment on table public.families is 'Shared family/household unit for document access';

-- ─── profiles ─────────────────────────────────────────────────────────────────
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  family_id     uuid not null references public.families (id) on delete cascade,
  display_name  text not null,
  avatar_url    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.profiles is 'User profile linked to a family';

create index idx_profiles_family_id on public.profiles (family_id);

-- ─── documents ────────────────────────────────────────────────────────────────
create table public.documents (
  id                uuid primary key default uuid_generate_v4(),
  family_id         uuid not null references public.families (id) on delete cascade,
  uploaded_by       uuid not null references public.profiles (id) on delete set null,
  storage_path      text not null unique,
  file_name         text not null,
  file_size         bigint not null,
  mime_type         text not null,

  -- Claude analysis fields
  title             text,
  category          document_category,
  summary           text,
  tags              text[] not null default '{}',
  analysis_status   analysis_status not null default 'pending',
  analyzed_at       timestamptz,

  -- Full-text search vector (auto-updated by trigger)
  search_vector     tsvector generated always as (
    setweight(to_tsvector('german', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('german', coalesce(summary, '')), 'B') ||
    setweight(to_tsvector('simple', array_to_string(tags, ' ')), 'C') ||
    setweight(to_tsvector('simple', coalesce(file_name, '')), 'D')
  ) stored,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.documents is 'Document metadata + Claude analysis results';

create index idx_documents_family_id      on public.documents (family_id);
create index idx_documents_category       on public.documents (family_id, category);
create index idx_documents_analysis_status on public.documents (analysis_status) where analysis_status != 'done';
create index idx_documents_search_vector  on public.documents using gin (search_vector);
create index idx_documents_tags           on public.documents using gin (tags);
create index idx_documents_created_at     on public.documents (family_id, created_at desc);

-- ─── document_dates ───────────────────────────────────────────────────────────
create table public.document_dates (
  id                 uuid primary key default uuid_generate_v4(),
  document_id        uuid not null references public.documents (id) on delete cascade,
  family_id          uuid not null references public.families (id) on delete cascade,
  label              text not null,
  date               date not null,
  priority           date_priority not null default 'medium',
  calendar_synced    boolean not null default false,
  calendar_event_id  text,
  created_at         timestamptz not null default now()
);

comment on table public.document_dates is 'Extracted deadlines/dates from documents (one per row)';

create index idx_document_dates_document_id on public.document_dates (document_id);
create index idx_document_dates_family_date on public.document_dates (family_id, date asc);
create index idx_document_dates_upcoming    on public.document_dates (family_id, date asc)
  where date >= current_date and calendar_synced = false;

-- ─── updated_at trigger ───────────────────────────────────────────────────────
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.handle_updated_at();

create trigger trg_documents_updated_at
  before update on public.documents
  for each row execute function public.handle_updated_at();

-- ─── new-user trigger: auto-create profile skeleton ──────────────────────────
-- NOTE: call create_family_and_profile() from the app after registration
-- to properly set up family_id. This trigger creates a temporary solo family.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
declare
  v_family_id uuid;
begin
  -- Create a personal family for the new user (they can be invited to another family later)
  insert into public.families (name)
  values (coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)) || '''s Haushalt')
  returning id into v_family_id;

  insert into public.profiles (id, family_id, display_name)
  values (
    new.id,
    v_family_id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── Full-text search function ────────────────────────────────────────────────
create or replace function public.search_documents(
  query_text text,
  p_family_id uuid
)
returns table (
  id        uuid,
  title     text,
  category  document_category,
  summary   text,
  tags      text[],
  rank      float4
)
language sql stable as $$
  select
    d.id,
    d.title,
    d.category,
    d.summary,
    d.tags,
    ts_rank(d.search_vector, websearch_to_tsquery('german', query_text)) as rank
  from public.documents d
  where
    d.family_id = p_family_id
    and d.search_vector @@ websearch_to_tsquery('german', query_text)
  order by rank desc
  limit 50;
$$;
