-- SchlagLink: shared live driver locations for dispatch view.
-- Safe to run more than once.

create table if not exists driver_locations (
  id text primary key,
  driver_id text not null,
  driver_name text not null,
  vehicle_name text,
  subtask_id uuid references job_tasks(id) on delete set null,
  field_id uuid references fields(id) on delete set null,
  lat double precision not null,
  lng double precision not null,
  accuracy double precision,
  speed double precision,
  status text not null default 'unterwegs' check (status in ('unterwegs', 'in Arbeit', 'pausiert', 'Problem')),
  recorded_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table driver_locations drop constraint if exists driver_locations_status_check;
alter table driver_locations add constraint driver_locations_status_check
check (status in ('unterwegs', 'in Arbeit', 'pausiert', 'Problem', 'abgemeldet'));

create unique index if not exists driver_locations_driver_id_idx on driver_locations(driver_id);
create index if not exists driver_locations_recorded_at_idx on driver_locations(recorded_at);

alter table driver_locations enable row level security;

grant select, insert, update, delete on driver_locations to anon, authenticated;

drop policy if exists "phase1 demo public read driver locations" on driver_locations;
create policy "phase1 demo public read driver locations" on driver_locations
for select using (true);

drop policy if exists "phase1 demo public insert driver locations" on driver_locations;
create policy "phase1 demo public insert driver locations" on driver_locations
for insert with check (true);

drop policy if exists "phase1 demo public update driver locations" on driver_locations;
create policy "phase1 demo public update driver locations" on driver_locations
for update using (true) with check (true);

drop policy if exists "phase1 demo public delete driver locations" on driver_locations;
create policy "phase1 demo public delete driver locations" on driver_locations
for delete using (true);
