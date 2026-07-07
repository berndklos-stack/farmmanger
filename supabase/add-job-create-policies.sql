-- Farm-Manager: Auftragserstellung für Landwirte und Lohnunternehmer freigeben.
-- Einmal im Supabase SQL Editor ausführen, wenn neu angelegte Aufträge nicht
-- dauerhaft in der Dispo anderer Nutzer erscheinen.

grant select, insert, update, delete on jobs to anon, authenticated;
grant select, insert, update, delete on job_fields to anon, authenticated;
grant select, insert, update, delete on job_tasks to anon, authenticated;

alter table jobs add column if not exists job_number text;
create unique index if not exists jobs_job_number_unique_idx on jobs(job_number) where job_number is not null;

-- Phase-1 browser sync policies. These are intentionally permissive for the
-- local prototype and should be tightened before production.
drop policy if exists "phase1 demo public insert jobs" on jobs;
create policy "phase1 demo public insert jobs" on jobs
for insert with check (true);

drop policy if exists "phase1 demo public update jobs" on jobs;
create policy "phase1 demo public update jobs" on jobs
for update using (true) with check (true);

drop policy if exists "phase1 demo public delete jobs" on jobs;
create policy "phase1 demo public delete jobs" on jobs
for delete using (true);

drop policy if exists "phase1 demo public insert job fields" on job_fields;
create policy "phase1 demo public insert job fields" on job_fields
for insert with check (true);

drop policy if exists "phase1 demo public update job fields" on job_fields;
create policy "phase1 demo public update job fields" on job_fields
for update using (true) with check (true);

drop policy if exists "phase1 demo public delete job fields" on job_fields;
create policy "phase1 demo public delete job fields" on job_fields
for delete using (true);

drop policy if exists "phase1 demo public insert job tasks" on job_tasks;
create policy "phase1 demo public insert job tasks" on job_tasks
for insert with check (true);

drop policy if exists "phase1 demo public update job tasks" on job_tasks;
create policy "phase1 demo public update job tasks" on job_tasks
for update using (true) with check (true);

drop policy if exists "phase1 demo public delete job tasks" on job_tasks;
create policy "phase1 demo public delete job tasks" on job_tasks
for delete using (true);

drop policy if exists "contractor admins create assigned jobs" on jobs;
create policy "contractor admins create assigned jobs" on jobs
for insert with check (
  contractor_organization_id = current_organization_id()
  and current_user_role()::text in ('contractor_admin', 'support_admin')
);

drop policy if exists "support admins manage jobs" on jobs;
create policy "support admins manage jobs" on jobs
for all using (current_user_role()::text = 'support_admin')
with check (current_user_role()::text = 'support_admin');

drop policy if exists "farmers and contractors insert job fields" on job_fields;
create policy "farmers and contractors insert job fields" on job_fields
for insert with check (
  exists (
    select 1
    from jobs j
    where j.id = job_id
      and (
        (
          j.farmer_organization_id = current_organization_id()
          and current_user_role()::text in ('farmer_admin', 'farmer_employee')
        )
        or (
          j.contractor_organization_id = current_organization_id()
          and current_user_role()::text in ('contractor_admin', 'support_admin')
        )
      )
  )
);

drop policy if exists "farmers and contractors update job fields" on job_fields;
create policy "farmers and contractors update job fields" on job_fields
for update using (
  exists (
    select 1
    from jobs j
    where j.id = job_id
      and (
        (
          j.farmer_organization_id = current_organization_id()
          and current_user_role()::text in ('farmer_admin', 'farmer_employee')
        )
        or (
          j.contractor_organization_id = current_organization_id()
          and current_user_role()::text in ('contractor_admin', 'support_admin')
        )
      )
  )
) with check (
  exists (
    select 1
    from jobs j
    where j.id = job_id
      and (
        (
          j.farmer_organization_id = current_organization_id()
          and current_user_role()::text in ('farmer_admin', 'farmer_employee')
        )
        or (
          j.contractor_organization_id = current_organization_id()
          and current_user_role()::text in ('contractor_admin', 'support_admin')
        )
      )
  )
);

drop policy if exists "farmers and contractors insert job tasks" on job_tasks;
create policy "farmers and contractors insert job tasks" on job_tasks
for insert with check (
  exists (
    select 1
    from jobs j
    where j.id = job_id
      and (
        (
          j.farmer_organization_id = current_organization_id()
          and current_user_role()::text in ('farmer_admin', 'farmer_employee')
        )
        or (
          j.contractor_organization_id = current_organization_id()
          and current_user_role()::text in ('contractor_admin', 'support_admin')
        )
      )
  )
);

drop policy if exists "farmers and contractors update job tasks" on job_tasks;
create policy "farmers and contractors update job tasks" on job_tasks
for update using (
  exists (
    select 1
    from jobs j
    where j.id = job_id
      and (
        (
          j.farmer_organization_id = current_organization_id()
          and current_user_role()::text in ('farmer_admin', 'farmer_employee')
        )
        or (
          j.contractor_organization_id = current_organization_id()
          and current_user_role()::text in ('contractor_admin', 'support_admin')
        )
      )
  )
) with check (
  exists (
    select 1
    from jobs j
    where j.id = job_id
      and (
        (
          j.farmer_organization_id = current_organization_id()
          and current_user_role()::text in ('farmer_admin', 'farmer_employee')
        )
        or (
          j.contractor_organization_id = current_organization_id()
          and current_user_role()::text in ('contractor_admin', 'support_admin')
        )
      )
  )
);
