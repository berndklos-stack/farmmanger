-- Farm-Manager: Urlaubsantraege und Entscheidungsverlauf zentral speichern.
-- Safe to run more than once.
--
-- Phase 1 nutzt teils Personal-Stammdaten-Logins ohne echte Supabase-Auth-Session.
-- Deshalb sind die Policies bewusst app-offen wie bei driver_locations/task_reports.
-- Vor einem haerteren Produktivbetrieb sollten diese Policies auf Rollen/Organisationen
-- eingeschraenkt werden.

create table if not exists vacation_requests (
  id text primary key,
  driver_id text not null,
  driver_name text not null,
  from_date date not null,
  to_date date not null,
  days numeric(6,2) not null default 0,
  note text,
  status text not null default 'requested' check (status in ('requested', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by text,
  decision_reason text,
  history jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists vacation_requests_status_idx on vacation_requests(status);
create index if not exists vacation_requests_driver_id_idx on vacation_requests(driver_id);
create index if not exists vacation_requests_from_date_idx on vacation_requests(from_date);

create or replace function set_vacation_requests_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists vacation_requests_updated_at on vacation_requests;
create trigger vacation_requests_updated_at
before update on vacation_requests
for each row execute function set_vacation_requests_updated_at();

alter table vacation_requests enable row level security;

grant select, insert, update, delete on vacation_requests to anon, authenticated;

drop policy if exists "phase1 demo public read vacation requests" on vacation_requests;
create policy "phase1 demo public read vacation requests" on vacation_requests
for select using (true);

drop policy if exists "phase1 demo public insert vacation requests" on vacation_requests;
create policy "phase1 demo public insert vacation requests" on vacation_requests
for insert with check (true);

drop policy if exists "phase1 demo public update vacation requests" on vacation_requests;
create policy "phase1 demo public update vacation requests" on vacation_requests
for update using (true) with check (true);

drop policy if exists "phase1 demo public delete vacation requests" on vacation_requests;
create policy "phase1 demo public delete vacation requests" on vacation_requests
for delete using (true);
