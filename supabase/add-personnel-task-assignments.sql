-- Farm-Manager: Teilauftrags-Zuordnungen direkt mit Personal-Stammdaten verbinden.
-- Safe to run more than once.
--
-- Hintergrund:
-- Fahrer koennen sich ueber personnel_resources anmelden, ohne Supabase-Auth-
-- Profil in profiles zu besitzen. Bisher konnte task_assignments nur
-- driver_profile_id -> profiles(id) speichern. Dadurch schlugen Zuordnungen
-- fuer reine Personalstammdaten-Fahrer fehl.

alter table task_assignments
  add column if not exists personnel_resource_id uuid references personnel_resources(id) on delete cascade;

alter table task_assignments
  alter column driver_profile_id drop not null;

create unique index if not exists task_assignments_job_task_personnel_unique_idx
  on task_assignments(job_task_id, personnel_resource_id)
  where personnel_resource_id is not null;

grant select, insert, update on task_assignments to anon, authenticated;

drop policy if exists "phase1 demo public insert task assignments" on task_assignments;
create policy "phase1 demo public insert task assignments" on task_assignments
for insert with check (true);

drop policy if exists "phase1 demo public update task assignments" on task_assignments;
create policy "phase1 demo public update task assignments" on task_assignments
for update using (true) with check (true);
