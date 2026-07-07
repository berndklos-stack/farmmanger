-- Farm-Manager Phase 1 resources: vehicles and implements.
-- Run this after schema.sql. It is safe to run more than once.

do $$
begin
  create type resource_status as enum ('frei', 'zugewiesen', 'wartung');
exception
  when duplicate_object then null;
end $$;

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

alter table vehicles enable row level security;
alter table implements enable row level security;

alter table profiles add column if not exists resource_type text;
alter table profiles add column if not exists operation_type text;
alter table profiles add column if not exists mobile text;
alter table profiles add column if not exists license_classes text[];
alter table profiles add column if not exists max_daily_hours numeric(5,2) default 8;
alter table vehicles add column if not exists license_plate text;
alter table vehicles add column if not exists resource_type text;
alter table vehicles add column if not exists operation_type text;
alter table implements add column if not exists resource_type text;
alter table implements add column if not exists operation_type text;

drop policy if exists "phase1 demo public read vehicles" on vehicles;
create policy "phase1 demo public read vehicles" on vehicles
for select using (true);

drop policy if exists "phase1 demo public read implements" on implements;
create policy "phase1 demo public read implements" on implements
for select using (true);

insert into vehicles (id, organization_id, name, vehicle_type, license_plate, resource_type, operation_type, status)
values
  ('60000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'Fendt 724', 'Schlepper', 'SLA 724', 'Zugmaschine', 'Gülle/Transport', 'zugewiesen'),
  ('60000000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'John Deere 6250R', 'Schlepper', 'SLA 250', 'Zugmaschine', 'Gülle/Saat', 'zugewiesen'),
  ('60000000-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222', 'Claas Jaguar 950', 'Häcksler', 'SLA 950', 'Selbstfahrer', 'Häckseln', 'frei'),
  ('60000000-0000-4000-8000-000000000004', '22222222-2222-4222-8222-222222222222', 'MAN Agrar-LKW', 'Transport', 'SLA 480', 'Transportfahrzeug', 'Abfahren', 'frei'),
  ('60000000-0000-4000-8000-000000000005', '22222222-2222-4222-8222-222222222222', 'Valtra N175', 'Schlepper', 'SLA 175', 'Zugmaschine', 'Reserve', 'wartung')
on conflict (id) do update set
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
  name = excluded.name,
  implement_type = excluded.implement_type,
  resource_type = excluded.resource_type,
  operation_type = excluded.operation_type,
  status = excluded.status,
  updated_at = now();

update profiles
set
  resource_type = 'Personal',
  operation_type = case full_name
    when 'Max' then 'Gülle'
    when 'Jens' then 'Gülle'
    when 'Lisa' then 'Grünland'
    when 'Tom' then 'Saat'
    else operation_type
  end,
  mobile = case full_name
    when 'Max' then '+46 70 111 22 33'
    when 'Jens' then '+46 70 222 33 44'
    when 'Lisa' then '+46 70 333 44 55'
    when 'Tom' then '+46 70 444 55 66'
    else mobile
  end,
  license_classes = case full_name
    when 'Max' then array['B', 'T', 'CE']
    when 'Jens' then array['B', 'T', 'CE']
    when 'Lisa' then array['B', 'T']
    when 'Tom' then array['B', 'T']
    else license_classes
  end,
  max_daily_hours = case full_name
    when 'Max' then 10
    when 'Jens' then 9
    when 'Lisa' then 8
    when 'Tom' then 8
    else max_daily_hours
  end
where role = 'driver';
