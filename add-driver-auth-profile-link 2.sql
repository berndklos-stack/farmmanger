-- Farm-Manager Phase 1: Verknuepfung Personalstammdaten mit Supabase Auth/Profile.
-- Vor dem Deploy der Edge Function sync-driver-auth ausfuehren.

alter table personnel_resources
  add column if not exists profile_id uuid references profiles(id) on delete set null;

create unique index if not exists personnel_resources_profile_id_unique_idx
  on personnel_resources(profile_id)
  where profile_id is not null;

create index if not exists personnel_resources_profile_id_idx
  on personnel_resources(profile_id);

alter table profiles add column if not exists vehicle_name text;
alter table profiles add column if not exists job_visibility text not null default 'assigned_only';

grant select, insert, update on profiles to anon, authenticated;
grant select, insert, update on personnel_resources to anon, authenticated;
