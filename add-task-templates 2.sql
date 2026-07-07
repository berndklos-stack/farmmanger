-- Farm-Manager Phase 1 task master data.
-- Run this after supabase/schema.sql. It is safe to run more than once.

create table if not exists task_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  is_system_template boolean not null default false,
  template_owner_type text not null default 'organization' check (template_owner_type in ('system', 'organization')),
  source_template_id uuid references task_templates(id) on delete set null,
  created_by_admin boolean not null default false,
  name text not null,
  work_steps text[] not null default '{}',
  time_per_ha numeric(8,2) not null default 0,
  work_mode work_mode not null default 'single',
  progress_type progress_type not null default 'area',
  max_vehicles integer not null default 1 check (max_vehicles > 0),
  required_drivers integer default 1,
  required_vehicles integer default 1,
  required_implements integer default 0,
  resource_hint text,
  quantity_unit text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table task_templates add column if not exists archived_at timestamptz;
alter table task_templates add column if not exists is_system_template boolean not null default false;
alter table task_templates add column if not exists template_owner_type text not null default 'organization';
alter table task_templates add column if not exists source_template_id uuid references task_templates(id) on delete set null;
alter table task_templates add column if not exists created_by_admin boolean not null default false;
alter table task_templates add column if not exists quantity_unit text;

create index if not exists task_templates_organization_id_idx on task_templates(organization_id);
create index if not exists task_templates_template_owner_type_idx on task_templates(template_owner_type);
create index if not exists task_templates_archived_at_idx on task_templates(archived_at);

alter table task_templates enable row level security;

grant select, insert, update, delete on task_templates to anon, authenticated;

-- Phase-1 prototype policies.
-- The app still works without real auth, so anon users can read/write demo task master data.
-- Replace these policies before production.
drop policy if exists "phase1 demo public read task templates" on task_templates;
create policy "phase1 demo public read task templates" on task_templates
for select using (true);

drop policy if exists "phase1 demo public insert task templates" on task_templates;
create policy "phase1 demo public insert task templates" on task_templates
for insert with check (true);

drop policy if exists "phase1 demo public update task templates" on task_templates;
create policy "phase1 demo public update task templates" on task_templates
for update using (true) with check (true);

drop policy if exists "phase1 demo public delete task templates" on task_templates;
create policy "phase1 demo public delete task templates" on task_templates
for delete using (true);

insert into task_templates (
  id,
  organization_id,
  name,
  work_steps,
  time_per_ha,
  work_mode,
  progress_type,
  max_vehicles,
  required_drivers,
  required_vehicles,
  required_implements,
  resource_hint,
  quantity_unit
)
values
  ('80000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'Gülle ausbringen', array['Anfahrt', 'Ausbringen', 'Fuhren dokumentieren'], 0.38, 'team', 'quantity', 2, 1, 1, 1, 'Schlepper mit Güllefass', 'm³'),
  ('80000000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'Mist ausbringen', array['Laden', 'Ausbringen', 'Randbereiche prüfen'], 0.45, 'team', 'quantity', 2, 1, 1, 1, 'Streuerkolonne', 't'),
  ('80000000-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222', 'Säen', array['Saatgut prüfen', 'Säen', 'Ablagetiefe kontrollieren'], 0.30, 'single', 'area', 1, 1, 1, 1, 'Schlepper mit Sämaschine', 'ha'),
  ('80000000-0000-4000-8000-000000000004', '22222222-2222-4222-8222-222222222222', 'Walzen', array['Walzen', 'Vorgewende prüfen'], 0.18, 'team', 'time', 2, 1, 1, 1, 'Walzschlepper', 'h'),
  ('80000000-0000-4000-8000-000000000005', '22222222-2222-4222-8222-222222222222', 'Grubbern', array['Grubbern', 'Problemstellen melden'], 0.42, 'single', 'area', 1, 1, 1, 1, 'Bodenbearbeitung', 'ha'),
  ('80000000-0000-4000-8000-000000000006', '22222222-2222-4222-8222-222222222222', 'Mähen', array['Mähen', 'Vorgewende mähen'], 0.28, 'single', 'area', 1, 1, 1, 1, 'Mähkombination', 'ha'),
  ('80000000-0000-4000-8000-000000000007', '22222222-2222-4222-8222-222222222222', 'Schwaden', array['Schwaden', 'Schwadqualität prüfen'], 0.22, 'single', 'area', 1, 1, 1, 1, 'Schwader', 'ha'),
  ('80000000-0000-4000-8000-000000000008', '22222222-2222-4222-8222-222222222222', 'Häckseln', array['Häckseln', 'Abfahrer koordinieren'], 0.55, 'role_based', 'time', 2, 1, 1, 0, 'Häcksler', 'h'),
  ('80000000-0000-4000-8000-000000000009', '22222222-2222-4222-8222-222222222222', 'Abfahren', array['Laden', 'Transport', 'Abladen'], 0.70, 'team', 'trips', 4, 1, 1, 1, 'Abfahrgespann', 'Fuhren'),
  ('80000000-0000-4000-8000-000000000010', '22222222-2222-4222-8222-222222222222', 'Kalk streuen', array['Streumenge prüfen', 'Streuen'], 0.25, 'team', 'quantity', 2, 1, 1, 1, 'Streuer', 't')
on conflict (id) do update set
  name = excluded.name,
  work_steps = excluded.work_steps,
  time_per_ha = excluded.time_per_ha,
  work_mode = excluded.work_mode,
  progress_type = excluded.progress_type,
  max_vehicles = excluded.max_vehicles,
  required_drivers = excluded.required_drivers,
  required_vehicles = excluded.required_vehicles,
  required_implements = excluded.required_implements,
  resource_hint = excluded.resource_hint,
  quantity_unit = excluded.quantity_unit,
  updated_at = now();
