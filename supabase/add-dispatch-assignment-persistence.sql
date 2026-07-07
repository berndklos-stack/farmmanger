-- Farm-Manager: allow saving dispatch calendar assignments from the app.
-- Run this once in Supabase SQL editor if assignment changes do not persist.

grant select, insert, update on task_assignments to anon, authenticated;
grant select, update on job_tasks to anon, authenticated;

drop policy if exists "phase1 demo public insert task assignments" on task_assignments;
create policy "phase1 demo public insert task assignments" on task_assignments
for insert with check (true);

drop policy if exists "phase1 demo public update task assignments" on task_assignments;
create policy "phase1 demo public update task assignments" on task_assignments
for update using (true) with check (true);

drop policy if exists "phase1 demo public update job tasks" on job_tasks;
create policy "phase1 demo public update job tasks" on job_tasks
for update using (true) with check (true);
