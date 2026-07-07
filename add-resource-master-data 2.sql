-- SchlagLink Phase 1: resource master data in Supabase.
-- Run this after schema.sql. It is safe to run more than once.

create extension if not exists pgcrypto;

do $$
begin
  create type resource_status as enum ('frei', 'zugewiesen', 'wartung');
exception
  when duplicate_object then null;
end $$;

create table if not exists personnel_resources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  full_name text not null,
  email text,
  access_password text,
  vehicle_name text,
  job_visibility text not null default 'assigned_only' check (job_visibility in ('contractor_all', 'assigned_only')),
  mobile text,
  license_classes text[] not null default '{}',
  max_daily_hours numeric(5,2) not null default 8,
  resource_type text,
  operation_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists vehicles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  name text not null,
  vehicle_type text not null,
  license_plate text,
  resource_type text,
  operation_type text,
  status resource_status not null default 'frei',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists implements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  name text not null,
  implement_type text not null,
  resource_type text,
  operation_type text,
  status resource_status not null default 'frei',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table personnel_resources add column if not exists vehicle_name text;
alter table personnel_resources add column if not exists email text;
alter table personnel_resources add column if not exists access_password text;
alter table personnel_resources add column if not exists job_visibility text not null default 'assigned_only';
alter table personnel_resources add column if not exists mobile text;
alter table personnel_resources add column if not exists license_classes text[] not null default '{}';
alter table personnel_resources add column if not exists max_daily_hours numeric(5,2) not null default 8;
alter table personnel_resources add column if not exists resource_type text;
alter table personnel_resources add column if not exists operation_type text;
alter table vehicles add column if not exists license_plate text;
alter table vehicles add column if not exists resource_type text;
alter table vehicles add column if not exists operation_type text;
alter table implements add column if not exists resource_type text;
alter table implements add column if not exists operation_type text;

alter table personnel_resources enable row level security;
alter table vehicles enable row level security;
alter table implements enable row level security;

grant select, insert, update on personnel_resources to anon, authenticated;
grant select, insert, update on vehicles to anon, authenticated;
grant select, insert, update on implements to anon, authenticated;

drop policy if exists "phase1 demo public read personnel resources" on personnel_resources;
create policy "phase1 demo public read personnel resources" on personnel_resources
for select using (true);

drop policy if exists "phase1 demo public insert personnel resources" on personnel_resources;
create policy "phase1 demo public insert personnel resources" on personnel_resources
for insert with check (true);

drop policy if exists "phase1 demo public update personnel resources" on personnel_resources;
create policy "phase1 demo public update personnel resources" on personnel_resources
for update using (true) with check (true);

drop policy if exists "phase1 demo public read vehicles" on vehicles;
create policy "phase1 demo public read vehicles" on vehicles
for select using (true);

drop policy if exists "phase1 demo public insert vehicles" on vehicles;
create policy "phase1 demo public insert vehicles" on vehicles
for insert with check (true);

drop policy if exists "phase1 demo public update vehicles" on vehicles;
create policy "phase1 demo public update vehicles" on vehicles
for update using (true) with check (true);

drop policy if exists "phase1 demo public read implements" on implements;
create policy "phase1 demo public read implements" on implements
for select using (true);

drop policy if exists "phase1 demo public insert implements" on implements;
create policy "phase1 demo public insert implements" on implements
for insert with check (true);

drop policy if exists "phase1 demo public update implements" on implements;
create policy "phase1 demo public update implements" on implements
for update using (true) with check (true);

insert into personnel_resources (
  id,
  organization_id,
  full_name,
  email,
  access_password,
  vehicle_name,
  job_visibility,
  mobile,
  license_classes,
  max_daily_hours,
  resource_type,
  operation_type
)
values
  ('50000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'Max', 'max@schlaglink.app', 'schlaglink-demo', 'Fendt 724', 'contractor_all', '+46 70 111 22 33', array['B', 'T', 'CE'], 10, 'Personal', 'Gülle'),
  ('50000000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'Jens', 'jens@schlaglink.app', 'schlaglink-demo', 'John Deere 6250R', 'assigned_only', '+46 70 222 33 44', array['B', 'T', 'CE'], 9, 'Personal', 'Gülle'),
  ('50000000-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222', 'Lisa', 'lisa@schlaglink.app', 'schlaglink-demo', 'Claas Jaguar 950', 'assigned_only', '+46 70 333 44 55', array['B', 'T'], 8, 'Personal', 'Grünland'),
  ('50000000-0000-4000-8000-000000000004', '22222222-2222-4222-8222-222222222222', 'Tom', 'tom@schlaglink.app', 'schlaglink-demo', 'John Deere 6250R', 'assigned_only', '+46 70 444 55 66', array['B', 'T'], 8, 'Personal', 'Saat'),
  ('50000000-0000-4000-8000-000000000005', '22222222-2222-4222-8222-222222222222', 'Olof', 'olof@schlaglink.app', 'schlaglink-demo', 'MAN Agrar-LKW', 'contractor_all', '+46 70 555 66 77', array['B', 'T', 'CE'], 9, 'Personal', 'Transport')
on conflict (id) do update set
  organization_id = excluded.organization_id,
  full_name = excluded.full_name,
  email = excluded.email,
  access_password = excluded.access_password,
  vehicle_name = excluded.vehicle_name,
  job_visibility = excluded.job_visibility,
  mobile = excluded.mobile,
  license_classes = excluded.license_classes,
  max_daily_hours = excluded.max_daily_hours,
  resource_type = excluded.resource_type,
  operation_type = excluded.operation_type,
  updated_at = now();

insert into vehicles (id, organization_id, name, vehicle_type, license_plate, resource_type, operation_type, status)
values
  ('60000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'Fendt 724', 'Schlepper', 'SLA 724', 'Zugmaschine', 'Gülle/Transport', 'zugewiesen'),
  ('60000000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'John Deere 6250R', 'Schlepper', 'SLA 250', 'Zugmaschine', 'Gülle/Saat', 'zugewiesen'),
  ('60000000-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222', 'Claas Jaguar 950', 'Häcksler', 'SLA 950', 'Selbstfahrer', 'Häckseln', 'frei'),
  ('60000000-0000-4000-8000-000000000004', '22222222-2222-4222-8222-222222222222', 'MAN Agrar-LKW', 'Transport', 'SLA 480', 'Transportfahrzeug', 'Abfahren', 'frei'),
  ('60000000-0000-4000-8000-000000000005', '22222222-2222-4222-8222-222222222222', 'Valtra N175', 'Schlepper', 'SLA 175', 'Zugmaschine', 'Reserve', 'wartung')
on conflict (id) do update set
  organization_id = excluded.organization_id,
  name = excluded.name,
  vehicle_type = excluded.vehicle_type,
  license_plate = excluded.license_plate,
  resource_type = excluded.resource_type,
  operation_type = excluded.operation_type,
  status = excluded.status,
  updated_at = now();

insert into implements (id, organization_id, name, implement_type, resource_type, operation_type, status)
values
  ('70000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'Güllefass 1', 'Gülletechnik', 'Anbaugerät', 'Gülle ausbringen', 'zugewiesen'),
  ('70000000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'Güllefass 2', 'Gülletechnik', 'Anbaugerät', 'Gülle ausbringen', 'zugewiesen'),
  ('70000000-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222', 'Sämaschine 6 m', 'Sätechnik', 'Anbaugerät', 'Säen', 'frei'),
  ('70000000-0000-4000-8000-000000000004', '22222222-2222-4222-8222-222222222222', 'Mähwerk Kombi', 'Grünland', 'Anbaugerät', 'Mähen', 'frei'),
  ('70000000-0000-4000-8000-000000000005', '22222222-2222-4222-8222-222222222222', 'Silowalze', 'Silo', 'Anbaugerät', 'Walzen', 'frei')
on conflict (id) do update set
  organization_id = excluded.organization_id,
  name = excluded.name,
  implement_type = excluded.implement_type,
  resource_type = excluded.resource_type,
  operation_type = excluded.operation_type,
  status = excluded.status,
  updated_at = now();
