-- SchlagLink Phase 1 demo data for Supabase.
-- Run this in the Supabase SQL Editor after schema.sql and fix-rls-recursion.sql.
-- This script is idempotent and can be executed more than once.

create extension if not exists pgcrypto;

alter type user_role add value if not exists 'support_admin';

alter table profiles add column if not exists vehicle_name text;
alter table profiles add column if not exists job_visibility text not null default 'assigned_only';
alter table jobs add column if not exists job_number text;
create unique index if not exists jobs_job_number_unique_idx on jobs(job_number) where job_number is not null;

-- Phase-1 prototype read policies.
-- The app has no real login yet, so anonymous users need read access to demo data.
-- Remove or replace these policies before going to production.
drop policy if exists "phase1 demo public read organizations" on organizations;
create policy "phase1 demo public read organizations" on organizations
for select using (true);

drop policy if exists "phase1 demo public read profiles" on profiles;
create policy "phase1 demo public read profiles" on profiles
for select using (true);

drop policy if exists "phase1 demo public read fields" on fields;
create policy "phase1 demo public read fields" on fields
for select using (true);

drop policy if exists "phase1 demo public read field boundaries" on field_boundaries;
create policy "phase1 demo public read field boundaries" on field_boundaries
for select using (true);

drop policy if exists "phase1 demo public read field hazards" on field_hazards;
create policy "phase1 demo public read field hazards" on field_hazards
for select using (true);

drop policy if exists "phase1 demo public read jobs" on jobs;
create policy "phase1 demo public read jobs" on jobs
for select using (true);

drop policy if exists "phase1 demo public read job fields" on job_fields;
create policy "phase1 demo public read job fields" on job_fields
for select using (true);

drop policy if exists "phase1 demo public read job tasks" on job_tasks;
create policy "phase1 demo public read job tasks" on job_tasks
for select using (true);

drop policy if exists "phase1 demo public read task assignments" on task_assignments;
create policy "phase1 demo public read task assignments" on task_assignments
for select using (true);

drop policy if exists "phase1 demo public read task reports" on task_reports;
create policy "phase1 demo public read task reports" on task_reports
for select using (true);

drop policy if exists "phase1 demo public read documents" on documents;
create policy "phase1 demo public read documents" on documents
for select using (true);

insert into organizations (id, name, organization_type, address)
values
  ('11111111-1111-4111-8111-111111111111', 'Hof Müller', 'farmer', 'Demo-Hof, Südschweden'),
  ('22222222-2222-4222-8222-222222222222', 'Agrarservice Schneider', 'contractor', 'Demo-Einsatzhof'),
  ('33333333-3333-4333-8333-333333333333', 'Hof Andersson', 'farmer', 'Skiftesvägen 12, Södra Sandby, Schweden'),
  ('44444444-4444-4444-8444-444444444444', 'Lohnbetrieb Nord', 'contractor', 'Transportvägen 3, Staffanstorp, Schweden'),
  ('55555555-5555-4555-8555-555555555555', 'Lohnunternehmen Klos', 'contractor', 'Kolaretorp, Schweden')
on conflict (id) do update set
  name = excluded.name,
  organization_type = excluded.organization_type,
  address = excluded.address;

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'support@schlaglink.app', crypt('1234', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"SchlagLink Support"}', now(), now()),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'landwirt@schlaglink.app', crypt('schlaglink-demo', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Hof Müller Admin"}', now(), now()),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'einsatzleiter@schlaglink.app', crypt('schlaglink-demo', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Agrarservice Schneider Admin"}', now(), now()),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bernd@kolaretorp.se', crypt('1234', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Bernd Kolaretorp"}', now(), now()),
  ('a3333333-3333-4333-8333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'andersson@schlaglink.app', crypt('1234', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Hof Andersson Admin"}', now(), now()),
  ('b4444444-4444-4444-8444-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'nord@schlaglink.app', crypt('1234', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Lohnbetrieb Nord Admin"}', now(), now()),
  ('dddddddd-dddd-4ddd-8ddd-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'max@schlaglink.app', crypt('schlaglink-demo', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Max"}', now(), now()),
  ('dddddddd-dddd-4ddd-8ddd-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'jens@schlaglink.app', crypt('schlaglink-demo', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Jens"}', now(), now()),
  ('dddddddd-dddd-4ddd-8ddd-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lisa@schlaglink.app', crypt('schlaglink-demo', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Lisa"}', now(), now()),
  ('dddddddd-dddd-4ddd-8ddd-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tom@schlaglink.app', crypt('schlaglink-demo', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Tom"}', now(), now()),
  ('dddddddd-dddd-4ddd-8ddd-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'olof@schlaglink.app', crypt('schlaglink-demo', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Olof"}', now(), now())
on conflict (id) do update set
  email = excluded.email,
  encrypted_password = excluded.encrypted_password,
  raw_user_meta_data = excluded.raw_user_meta_data,
  updated_at = now();

delete from auth.identities
where user_id in (
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'a3333333-3333-4333-8333-333333333333',
  'b4444444-4444-4444-8444-444444444444',
  'dddddddd-dddd-4ddd-8ddd-000000000001',
  'dddddddd-dddd-4ddd-8ddd-000000000002',
  'dddddddd-dddd-4ddd-8ddd-000000000003',
  'dddddddd-dddd-4ddd-8ddd-000000000004',
  'dddddddd-dddd-4ddd-8ddd-000000000005'
);

insert into auth.identities (
  id,
  user_id,
  provider_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
values
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'support@schlaglink.app', '{"sub":"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee","email":"support@schlaglink.app","email_verified":true,"phone_verified":false}'::jsonb, 'email', now(), now(), now()),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'landwirt@schlaglink.app', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","email":"landwirt@schlaglink.app","email_verified":true,"phone_verified":false}'::jsonb, 'email', now(), now(), now()),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'einsatzleiter@schlaglink.app', '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","email":"einsatzleiter@schlaglink.app","email_verified":true,"phone_verified":false}'::jsonb, 'email', now(), now(), now()),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'bernd@kolaretorp.se', '{"sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","email":"bernd@kolaretorp.se","email_verified":true,"phone_verified":false}'::jsonb, 'email', now(), now(), now()),
  ('a3333333-3333-4333-8333-333333333333', 'a3333333-3333-4333-8333-333333333333', 'andersson@schlaglink.app', '{"sub":"a3333333-3333-4333-8333-333333333333","email":"andersson@schlaglink.app","email_verified":true,"phone_verified":false}'::jsonb, 'email', now(), now(), now()),
  ('b4444444-4444-4444-8444-444444444444', 'b4444444-4444-4444-8444-444444444444', 'nord@schlaglink.app', '{"sub":"b4444444-4444-4444-8444-444444444444","email":"nord@schlaglink.app","email_verified":true,"phone_verified":false}'::jsonb, 'email', now(), now(), now()),
  ('dddddddd-dddd-4ddd-8ddd-000000000001', 'dddddddd-dddd-4ddd-8ddd-000000000001', 'max@schlaglink.app', '{"sub":"dddddddd-dddd-4ddd-8ddd-000000000001","email":"max@schlaglink.app","email_verified":true,"phone_verified":false}'::jsonb, 'email', now(), now(), now()),
  ('dddddddd-dddd-4ddd-8ddd-000000000002', 'dddddddd-dddd-4ddd-8ddd-000000000002', 'jens@schlaglink.app', '{"sub":"dddddddd-dddd-4ddd-8ddd-000000000002","email":"jens@schlaglink.app","email_verified":true,"phone_verified":false}'::jsonb, 'email', now(), now(), now()),
  ('dddddddd-dddd-4ddd-8ddd-000000000003', 'dddddddd-dddd-4ddd-8ddd-000000000003', 'lisa@schlaglink.app', '{"sub":"dddddddd-dddd-4ddd-8ddd-000000000003","email":"lisa@schlaglink.app","email_verified":true,"phone_verified":false}'::jsonb, 'email', now(), now(), now()),
  ('dddddddd-dddd-4ddd-8ddd-000000000004', 'dddddddd-dddd-4ddd-8ddd-000000000004', 'tom@schlaglink.app', '{"sub":"dddddddd-dddd-4ddd-8ddd-000000000004","email":"tom@schlaglink.app","email_verified":true,"phone_verified":false}'::jsonb, 'email', now(), now(), now()),
  ('dddddddd-dddd-4ddd-8ddd-000000000005', 'dddddddd-dddd-4ddd-8ddd-000000000005', 'olof@schlaglink.app', '{"sub":"dddddddd-dddd-4ddd-8ddd-000000000005","email":"olof@schlaglink.app","email_verified":true,"phone_verified":false}'::jsonb, 'email', now(), now(), now());

insert into profiles (id, full_name, email, role, organization_id, vehicle_name, job_visibility)
values
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'SchlagLink Support', 'support@schlaglink.app', 'support_admin', null, null, 'assigned_only'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Hof Müller Admin', 'landwirt@schlaglink.app', 'farmer_admin', '11111111-1111-4111-8111-111111111111', null, 'assigned_only'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Agrarservice Schneider Admin', 'einsatzleiter@schlaglink.app', 'contractor_admin', '22222222-2222-4222-8222-222222222222', null, 'assigned_only'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Bernd Kolaretorp', 'bernd@kolaretorp.se', 'contractor_admin', '55555555-5555-4555-8555-555555555555', null, 'assigned_only'),
  ('a3333333-3333-4333-8333-333333333333', 'Hof Andersson Admin', 'andersson@schlaglink.app', 'farmer_admin', '33333333-3333-4333-8333-333333333333', null, 'assigned_only'),
  ('b4444444-4444-4444-8444-444444444444', 'Lohnbetrieb Nord Admin', 'nord@schlaglink.app', 'contractor_admin', '44444444-4444-4444-8444-444444444444', null, 'assigned_only'),
  ('dddddddd-dddd-4ddd-8ddd-000000000001', 'Max', 'max@schlaglink.app', 'driver', '22222222-2222-4222-8222-222222222222', 'Fendt 724', 'contractor_all'),
  ('dddddddd-dddd-4ddd-8ddd-000000000002', 'Jens', 'jens@schlaglink.app', 'driver', '22222222-2222-4222-8222-222222222222', 'John Deere 6250R', 'assigned_only'),
  ('dddddddd-dddd-4ddd-8ddd-000000000003', 'Lisa', 'lisa@schlaglink.app', 'driver', '22222222-2222-4222-8222-222222222222', 'Claas Jaguar 950', 'assigned_only'),
  ('dddddddd-dddd-4ddd-8ddd-000000000004', 'Tom', 'tom@schlaglink.app', 'driver', '22222222-2222-4222-8222-222222222222', 'John Deere 6250R', 'assigned_only'),
  ('dddddddd-dddd-4ddd-8ddd-000000000005', 'Olof', 'olof@schlaglink.app', 'driver', '22222222-2222-4222-8222-222222222222', 'MAN Agrar-LKW', 'contractor_all')
on conflict (id) do update set
  full_name = excluded.full_name,
  email = excluded.email,
  role = excluded.role,
  organization_id = excluded.organization_id,
  vehicle_name = excluded.vehicle_name,
  job_visibility = excluded.job_visibility;

insert into fields (
  id,
  organization_id,
  name,
  area_ha,
  crop,
  ownership_type,
  center_lat,
  center_lng,
  access_lat,
  access_lng,
  access_description,
  notes
)
values
  ('10000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Nordfeld 1', 8.40, 'Mais', 'owned', 55.72572, 13.17942, 55.72498, 13.17792, 'Von der Hofstelle Richtung Norden fahren, nach 800 m links in den Feldweg. Zufahrt über das westliche Tor.', 'Südwest-Ecke bei Regen meiden'),
  ('10000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'Nordfeld 2', 6.20, 'Mais', 'lease', 55.72904, 13.18423, 55.72818, 13.18282, 'Vom nördlichen Wirtschaftsweg kommend langsam in die enge Zufahrt einbiegen. Große Gespanne nacheinander einweisen.', 'Nicht am Wohnhaus wenden'),
  ('10000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'Hofacker', 11.80, 'Weizen', 'owned', 55.71936, 13.17152, 55.72008, 13.17002, 'Direkt vom Hof Richtung Westen fahren und an der Nordkante einfahren. Randstreifen mit Steinen beachten.', null),
  ('10000000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 'Wiese am Bach', 3.10, 'Gras', 'lease', 55.71620, 13.18758, 55.71562, 13.18656, 'Über die schmale Brücke am Bach zufahren. Gewässerabstand einhalten und nur leichte Gespanne nutzen.', 'Bachkante nicht befahren'),
  ('10000000-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111', 'Südacker', 14.50, 'Raps', 'owned', 55.70958, 13.17682, 55.70912, 13.17982, 'Nicht über den Hof Schmidt fahren. Zufahrt nur über Feldweg Ost, bei Regen Tragfähigkeit prüfen.', 'Keine Durchfahrt Hof Schmidt')
on conflict (id) do update set
  name = excluded.name,
  area_ha = excluded.area_ha,
  crop = excluded.crop,
  ownership_type = excluded.ownership_type,
  center_lat = excluded.center_lat,
  center_lng = excluded.center_lng,
  access_lat = excluded.access_lat,
  access_lng = excluded.access_lng,
  access_description = excluded.access_description,
  notes = excluded.notes,
  updated_at = now();

delete from field_boundaries
where field_id in (
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000004',
  '10000000-0000-4000-8000-000000000005'
);

insert into field_boundaries (field_id, points_json)
values
  ('10000000-0000-4000-8000-000000000001', '[{"lat":55.72658,"lng":13.17782},{"lat":55.72705,"lng":13.18108},{"lat":55.72554,"lng":13.18182},{"lat":55.72454,"lng":13.17972},{"lat":55.72486,"lng":13.17756}]'::jsonb),
  ('10000000-0000-4000-8000-000000000002', '[{"lat":55.72992,"lng":13.18258},{"lat":55.73028,"lng":13.1857},{"lat":55.7287,"lng":13.18614},{"lat":55.72792,"lng":13.1842},{"lat":55.7283,"lng":13.18274}]'::jsonb),
  ('10000000-0000-4000-8000-000000000003', '[{"lat":55.72032,"lng":13.16942},{"lat":55.72102,"lng":13.17306},{"lat":55.71862,"lng":13.17414},{"lat":55.71782,"lng":13.17122},{"lat":55.7189,"lng":13.16912}]'::jsonb),
  ('10000000-0000-4000-8000-000000000004', '[{"lat":55.71692,"lng":13.18642},{"lat":55.71712,"lng":13.18862},{"lat":55.71572,"lng":13.18904},{"lat":55.71508,"lng":13.1873},{"lat":55.71562,"lng":13.18634}]'::jsonb),
  ('10000000-0000-4000-8000-000000000005', '[{"lat":55.71092,"lng":13.17452},{"lat":55.71134,"lng":13.17898},{"lat":55.70872,"lng":13.18004},{"lat":55.70786,"lng":13.17632},{"lat":55.70908,"lng":13.17372}]'::jsonb);

insert into field_hazards (id, field_id, hazard_type, title, description, lat, lng)
values
  ('11000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'wet_area', 'Nasse Ecke Südwest', 'Bei nassem Wetter nur mit leerer Maschine oder großem Bogen befahren.', 55.72478, 13.17810),
  ('11000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'narrow_access', 'Enge Zufahrt', 'Güllefässer einzeln einfahren lassen, Gegenverkehr vermeiden.', 55.72822, 13.18290),
  ('11000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', 'stones', 'Steine am Rand', 'Nordwestlichen Rand langsam bearbeiten, größere Steine sichtbar.', 55.72012, 13.16972),
  ('11000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000004', 'water_protection', 'Gewässerabstand', 'Zum Bachlauf mindestens 5 m Abstand halten.', 55.71558, 13.18704),
  ('11000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000005', 'other', 'Weicher Feldweg', 'Feldweg Ost ist nach Starkregen weich, Fahrspuren dokumentieren.', 55.70922, 13.17948)
on conflict (id) do update set
  hazard_type = excluded.hazard_type,
  title = excluded.title,
  description = excluded.description,
  lat = excluded.lat,
  lng = excluded.lng;

insert into jobs (
  id,
  job_number,
  farmer_organization_id,
  contractor_organization_id,
  title,
  description,
  planned_start,
  planned_end,
  priority,
  status,
  created_by
)
values
  ('20000000-0000-4000-8000-000000000001', 'A-001', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'Gülle ausbringen', '25 m³/ha. Nasse Stellen langsam anfahren, Randbereiche sauber dokumentieren.', '2026-06-18 07:00:00+02', '2026-06-20 18:00:00+02', 'high', 'in_progress', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('20000000-0000-4000-8000-000000000002', 'A-002', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'Mais säen', 'Saatfenster nutzen, Reihenabstand und Ablagetiefe nach Hofvorgabe.', '2026-06-21 06:00:00+02', '2026-06-21 16:00:00+02', 'normal', 'open', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('20000000-0000-4000-8000-000000000003', 'A-003', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'Grassilage Wiese am Bach', 'Gewässerabstand beachten, Feuchtestellen markieren.', '2026-06-24 09:00:00+02', '2026-06-25 20:00:00+02', 'normal', 'scheduled', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
on conflict (id) do update set
  job_number = excluded.job_number,
  title = excluded.title,
  description = excluded.description,
  planned_start = excluded.planned_start,
  planned_end = excluded.planned_end,
  priority = excluded.priority,
  status = excluded.status,
  updated_at = now();

insert into job_fields (job_id, field_id, notes, access_notes)
values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', null, 'Westliches Tor am Feldweg'),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', null, 'Enge Zufahrt Südwest'),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', null, 'Hofzufahrt Nordkante'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', null, 'Westliches Tor am Feldweg'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', null, 'Enge Zufahrt Südwest'),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000004', null, 'Brücke am Bach')
on conflict (job_id, field_id) do update set
  notes = excluded.notes,
  access_notes = excluded.access_notes;

insert into job_tasks (
  id,
  job_id,
  field_id,
  task_type,
  title,
  description,
  work_mode,
  progress_type,
  target_area_ha,
  target_quantity,
  quantity_unit,
  target_trips,
  max_active_workers,
  status
)
values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'slurry', 'Gülle ausbringen', '25 m³/ha auf Nordfeld 1', 'team', 'quantity', 8.40, 210.00, 'm³', null, 2, 'active'),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'slurry', 'Gülle ausbringen', '25 m³/ha auf Nordfeld 2', 'team', 'quantity', 6.20, 155.00, 'm³', null, 2, 'reserved'),
  ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'slurry', 'Gülle ausbringen', '25 m³/ha auf Hofacker', 'team', 'quantity', 11.80, 295.00, 'm³', null, 2, 'open'),
  ('30000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'seeding', 'Mais säen', 'Einzelmodus auf Nordfeld 1', 'single', 'area', 8.40, null, 'ha', null, 1, 'open'),
  ('30000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'seeding', 'Mais säen', 'Saatgut noch nicht am Feld.', 'single', 'area', 6.20, null, 'ha', null, 1, 'problem'),
  ('30000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000004', 'mowing', 'Mähen', 'Erster Schnitt Wiese am Bach', 'single', 'area', 3.10, null, 'ha', null, 1, 'completed'),
  ('30000000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000004', 'turning', 'Wenden', 'Wenden auf Wiese am Bach', 'single', 'area', 3.10, null, 'ha', null, 1, 'partial'),
  ('30000000-0000-4000-8000-000000000008', '20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000004', 'raking', 'Schwaden', 'Schwaden auf Wiese am Bach', 'single', 'area', 3.10, null, 'ha', null, 1, 'open'),
  ('30000000-0000-4000-8000-000000000009', '20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000004', 'chopping', 'Häckseln', 'Rollenmodus mit Häcksler', 'role_based', 'time', null, 2.00, 'h', null, 2, 'open'),
  ('30000000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000004', 'hauling', 'Abfahren', 'Mehrere Fahrzeuge erlaubt', 'team', 'trips', null, null, 'Fuhren', 14, 3, 'open'),
  ('30000000-0000-4000-8000-000000000011', '20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000004', 'rolling', 'Walzen', 'Walzen am Silo', 'team', 'time', null, 2.00, 'h', null, 2, 'open')
on conflict (id) do update set
  title = excluded.title,
  description = excluded.description,
  work_mode = excluded.work_mode,
  progress_type = excluded.progress_type,
  target_area_ha = excluded.target_area_ha,
  target_quantity = excluded.target_quantity,
  quantity_unit = excluded.quantity_unit,
  target_trips = excluded.target_trips,
  max_active_workers = excluded.max_active_workers,
  status = excluded.status,
  updated_at = now();

insert into task_assignments (
  id,
  job_task_id,
  driver_profile_id,
  vehicle_name,
  status,
  started_at,
  completed_at,
  completed_area_ha,
  completed_quantity,
  completed_trips,
  notes
)
values
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'dddddddd-dddd-4ddd-8ddd-000000000001', 'Güllefass 1', 'active', '2026-06-18 08:10:00+02', null, null, 44.00, 4, null),
  ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001', 'dddddddd-dddd-4ddd-8ddd-000000000002', 'Güllefass 2', 'active', '2026-06-18 08:25:00+02', null, null, 44.00, 3, null),
  ('40000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000002', 'dddddddd-dddd-4ddd-8ddd-000000000002', 'Güllefass 2', 'reserved', null, null, null, 16.00, 1, 'Enge Zufahrt vorsichtig anfahren.'),
  ('40000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000006', 'dddddddd-dddd-4ddd-8ddd-000000000003', 'Schlepper', 'completed', '2026-06-24 09:20:00+02', '2026-06-24 11:10:00+02', 3.10, null, null, 'Anfahrt über Brücke problemlos.'),
  ('40000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000007', 'dddddddd-dddd-4ddd-8ddd-000000000003', 'Schlepper', 'active', '2026-06-24 13:15:00+02', null, 1.70, null, null, 'Neue feuchte Stelle am Bachrand markiert.')
on conflict (job_task_id, driver_profile_id) do update set
  vehicle_name = excluded.vehicle_name,
  status = excluded.status,
  started_at = excluded.started_at,
  completed_at = excluded.completed_at,
  completed_area_ha = excluded.completed_area_ha,
  completed_quantity = excluded.completed_quantity,
  completed_trips = excluded.completed_trips,
  notes = excluded.notes,
  updated_at = now();

insert into documents (id, organization_id, field_id, file_name, file_path, file_type, uploaded_by)
values
  ('50000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', '10000000-0000-4000-8000-000000000001', 'Zufahrt Westtor Foto', 'demo/nordfeld-1/zufahrt-westtor.jpg', 'image/jpeg', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('50000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', '10000000-0000-4000-8000-000000000001', 'Pachtkarte Nordfeld 1', 'demo/nordfeld-1/pachtkarte.pdf', 'application/pdf', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
on conflict (id) do update set
  file_name = excluded.file_name,
  file_path = excluded.file_path,
  file_type = excluded.file_type;
