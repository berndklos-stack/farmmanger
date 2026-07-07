-- Farm-Manager Phase 1: Supabase Storage and soft archive support.
-- Run this after schema.sql and the resource scripts. Safe to run more than once.

create extension if not exists pgcrypto;

alter table fields add column if not exists archived_at timestamptz;
alter table jobs add column if not exists archived_at timestamptz;
alter table organizations add column if not exists archived_at timestamptz;
alter table documents add column if not exists archived_at timestamptz;
alter table documents add column if not exists file_size bigint;

alter table personnel_resources add column if not exists archived_at timestamptz;
alter table vehicles add column if not exists archived_at timestamptz;
alter table implements add column if not exists archived_at timestamptz;

create index if not exists fields_archived_at_idx on fields(archived_at);
create index if not exists jobs_archived_at_idx on jobs(archived_at);
create index if not exists organizations_archived_at_idx on organizations(archived_at);
create index if not exists documents_archived_at_idx on documents(archived_at);
create index if not exists personnel_resources_archived_at_idx on personnel_resources(archived_at);
create index if not exists vehicles_archived_at_idx on vehicles(archived_at);
create index if not exists implements_archived_at_idx on implements(archived_at);

insert into storage.buckets (id, name, public)
values
  ('field-photos', 'field-photos', true),
  ('job-documents', 'job-documents', true),
  ('task-reports', 'task-reports', true)
on conflict (id) do update set public = excluded.public;

alter table documents enable row level security;

grant select, insert, update on documents to anon, authenticated;

drop policy if exists "phase1 demo public read documents" on documents;
create policy "phase1 demo public read documents" on documents
for select using (true);

drop policy if exists "phase1 demo public insert documents" on documents;
create policy "phase1 demo public insert documents" on documents
for insert with check (true);

drop policy if exists "phase1 demo public update documents" on documents;
create policy "phase1 demo public update documents" on documents
for update using (true) with check (true);

drop policy if exists "phase1 demo public upload storage objects" on storage.objects;
create policy "phase1 demo public upload storage objects" on storage.objects
for insert with check (
  bucket_id in ('field-photos', 'job-documents', 'task-reports')
);

drop policy if exists "phase1 demo public read storage objects" on storage.objects;
create policy "phase1 demo public read storage objects" on storage.objects
for select using (
  bucket_id in ('field-photos', 'job-documents', 'task-reports')
);

drop policy if exists "phase1 demo public update storage objects" on storage.objects;
create policy "phase1 demo public update storage objects" on storage.objects
for update using (
  bucket_id in ('field-photos', 'job-documents', 'task-reports')
) with check (
  bucket_id in ('field-photos', 'job-documents', 'task-reports')
);
