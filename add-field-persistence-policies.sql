-- Farm-Manager: allow saving field master data, boundaries and hazards from the app.
-- Run this once in Supabase SQL editor if new fields disappear after reload.

grant select, insert, update, delete on fields to anon, authenticated;
grant select, insert, update, delete on field_boundaries to anon, authenticated;
grant select, insert, update, delete on field_hazards to anon, authenticated;

drop policy if exists "phase1 demo public insert fields" on fields;
create policy "phase1 demo public insert fields" on fields
for insert with check (true);

drop policy if exists "phase1 demo public update fields" on fields;
create policy "phase1 demo public update fields" on fields
for update using (true) with check (true);

drop policy if exists "phase1 demo public delete fields" on fields;
create policy "phase1 demo public delete fields" on fields
for delete using (true);

drop policy if exists "phase1 demo public insert field boundaries" on field_boundaries;
create policy "phase1 demo public insert field boundaries" on field_boundaries
for insert with check (true);

drop policy if exists "phase1 demo public update field boundaries" on field_boundaries;
create policy "phase1 demo public update field boundaries" on field_boundaries
for update using (true) with check (true);

drop policy if exists "phase1 demo public delete field boundaries" on field_boundaries;
create policy "phase1 demo public delete field boundaries" on field_boundaries
for delete using (true);

drop policy if exists "phase1 demo public insert field hazards" on field_hazards;
create policy "phase1 demo public insert field hazards" on field_hazards
for insert with check (true);

drop policy if exists "phase1 demo public update field hazards" on field_hazards;
create policy "phase1 demo public update field hazards" on field_hazards
for update using (true) with check (true);

drop policy if exists "phase1 demo public delete field hazards" on field_hazards;
create policy "phase1 demo public delete field hazards" on field_hazards
for delete using (true);
