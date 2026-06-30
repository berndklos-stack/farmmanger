-- SchlagLink: Fahrerfotos zu Teilaufträgen speichern.
-- Safe to run more than once.

insert into storage.buckets (id, name, public)
values ('task-reports', 'task-reports', true)
on conflict (id) do update set public = true;

grant select, insert, delete on task_reports to anon, authenticated;

drop policy if exists "phase1 demo public insert task reports" on task_reports;
create policy "phase1 demo public insert task reports" on task_reports
for insert with check (true);

drop policy if exists "phase1 demo public upload task report photos" on storage.objects;
create policy "phase1 demo public upload task report photos" on storage.objects
for insert with check (bucket_id = 'task-reports');

drop policy if exists "phase1 demo public read task report photos" on storage.objects;
create policy "phase1 demo public read task report photos" on storage.objects
for select using (bucket_id = 'task-reports');

drop policy if exists "phase1 demo public delete task reports" on task_reports;
create policy "phase1 demo public delete task reports" on task_reports
for delete using (true);

drop policy if exists "phase1 demo public delete task report photos" on storage.objects;
create policy "phase1 demo public delete task report photos" on storage.objects
for delete using (bucket_id = 'task-reports');
