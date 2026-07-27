-- Farm-Manager production repair: unblock PostgREST/RLS timeouts.
--
-- Symptom:
-- Simple REST reads on organizations/profiles/fields/task_templates time out.
-- This usually happens when RLS policies call helper functions or table lookups
-- that recurse through profiles/current user policies.
--
-- Run once in Supabase SQL Editor for the linked Farm-Manager project.
-- It drops existing policies on Farm-Manager app tables and installs simple
-- permissive Phase-1 app policies again. This restores availability first.

grant usage on schema public to anon, authenticated;

do $$
declare
  app_table text;
  policy_record record;
  app_tables text[] := array[
    'profiles',
    'organizations',
    'organization_relationships',
    'external_contacts',
    'fields',
    'field_boundaries',
    'field_hazards',
    'documents',
    'jobs',
    'job_fields',
    'job_tasks',
    'task_assignments',
    'task_reports',
    'task_templates',
    'personnel_resources',
    'vehicles',
    'implements',
    'driver_locations',
    'driver_time_entries',
    'vacation_requests',
    'product_inventory',
    'product_inventory_movements'
  ];
begin
  foreach app_table in array app_tables loop
    if to_regclass(format('public.%I', app_table)) is not null then
      execute format('grant select, insert, update, delete on table public.%I to anon, authenticated', app_table);
      execute format('alter table public.%I enable row level security', app_table);

      for policy_record in
        select policyname
        from pg_policies
        where schemaname = 'public'
          and tablename = app_table
      loop
        execute format('drop policy if exists %I on public.%I', policy_record.policyname, app_table);
      end loop;

      execute format('create policy %I on public.%I for select using (true)', 'farm_manager_phase1_read', app_table);
      execute format('create policy %I on public.%I for insert with check (true)', 'farm_manager_phase1_insert', app_table);
      execute format('create policy %I on public.%I for update using (true) with check (true)', 'farm_manager_phase1_update', app_table);
      execute format('create policy %I on public.%I for delete using (true)', 'farm_manager_phase1_delete', app_table);
    end if;
  end loop;
end $$;

-- Keep these helpers harmless if older policies or functions still reference them.
-- The policies above no longer depend on them, but replacing them prevents old
-- recursive helper definitions from continuing to hurt future changes.
create or replace function public.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'organization_id', '')::uuid
$$;

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select current_setting('request.jwt.claims', true)::jsonb ->> 'role'
$$;
