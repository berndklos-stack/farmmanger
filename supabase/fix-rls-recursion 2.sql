-- Fix for "infinite recursion detected in policy for relation profiles".
-- Run this once in the Supabase SQL Editor after schema.sql if the original
-- profile policy has already been installed.

create or replace function current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id from profiles where id = auth.uid()
$$;

create or replace function current_user_role()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from profiles where id = auth.uid()
$$;

drop policy if exists "profiles read own organization" on profiles;
create policy "profiles read own organization" on profiles
for select using (
  id = auth.uid()
  or organization_id = current_organization_id()
);

drop policy if exists "farmer admins manage own fields" on fields;
create policy "farmer admins manage own fields" on fields
for all using (
  organization_id = current_organization_id()
  and current_user_role() in ('farmer_admin', 'farmer_employee')
) with check (
  organization_id = current_organization_id()
  and current_user_role() in ('farmer_admin', 'farmer_employee')
);

drop policy if exists "field boundaries manage own farmer fields" on field_boundaries;
create policy "field boundaries manage own farmer fields" on field_boundaries
for all using (
  exists (
    select 1 from fields f
    where f.id = field_id
      and f.organization_id = current_organization_id()
      and current_user_role() in ('farmer_admin', 'farmer_employee')
  )
) with check (
  exists (
    select 1 from fields f
    where f.id = field_id
      and f.organization_id = current_organization_id()
      and current_user_role() in ('farmer_admin', 'farmer_employee')
  )
);

drop policy if exists "farmer admins manage own jobs" on jobs;
create policy "farmer admins manage own jobs" on jobs
for all using (
  farmer_organization_id = current_organization_id()
  and current_user_role() in ('farmer_admin', 'farmer_employee')
) with check (
  farmer_organization_id = current_organization_id()
  and current_user_role() in ('farmer_admin', 'farmer_employee')
);

drop policy if exists "contractor admins manage assigned job tasks" on job_tasks;
create policy "contractor admins manage assigned job tasks" on job_tasks
for update using (
  exists (
    select 1 from jobs j
    where j.id = job_id
      and j.contractor_organization_id = current_organization_id()
      and current_user_role() = 'contractor_admin'
  )
);

drop policy if exists "contractor admins manage assignments" on task_assignments;
create policy "contractor admins manage assignments" on task_assignments
for all using (
  exists (
    select 1 from job_tasks jt
    join jobs j on j.id = jt.job_id
    where jt.id = job_task_id
      and j.contractor_organization_id = current_organization_id()
      and current_user_role() = 'contractor_admin'
  )
) with check (
  exists (
    select 1 from job_tasks jt
    join jobs j on j.id = jt.job_id
    where jt.id = job_task_id
      and j.contractor_organization_id = current_organization_id()
      and current_user_role() = 'contractor_admin'
  )
);

drop policy if exists "documents insert own organization" on documents;
create policy "documents insert own organization" on documents
for insert with check (
  uploaded_by = auth.uid()
  and organization_id = current_organization_id()
);
