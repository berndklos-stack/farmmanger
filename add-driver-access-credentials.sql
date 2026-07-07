-- SchlagLink: Fahrer-Zugangsdaten in den Personal-Stammdaten.
-- Einmal im Supabase SQL Editor ausführen.

alter table personnel_resources add column if not exists email text;
alter table personnel_resources add column if not exists access_password text;

create index if not exists personnel_resources_email_idx
  on personnel_resources (lower(email))
  where email is not null and archived_at is null;
