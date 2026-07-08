-- SchlagLink: allow saving organization master data from the app.
-- Run this once in Supabase SQL editor if browser-to-Supabase sync reports
-- row-level security errors on the organizations table.
-- Prototype policy: permissive for anon/authenticated. Tighten before production.

grant select, insert, update, delete on organizations to anon, authenticated;

drop policy if exists "phase1 demo public insert organizations" on organizations;
create policy "phase1 demo public insert organizations" on organizations
for insert with check (true);

drop policy if exists "phase1 demo public update organizations" on organizations;
create policy "phase1 demo public update organizations" on organizations
for update using (true) with check (true);

drop policy if exists "phase1 demo public delete organizations" on organizations;
create policy "phase1 demo public delete organizations" on organizations
for delete using (true);
