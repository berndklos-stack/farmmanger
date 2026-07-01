-- SchlagLink: Status-Protokolle fuer Teilauftraege speichern.
-- Safe to run more than once.
--
-- Warum:
-- Fahrer koennen sich aktuell auch ueber Personal-Stammdaten anmelden. Dieser
-- Login erzeugt keine Supabase-Auth-Session, deshalb scheitert die strenge
-- Standard-Policy "task reports insert own" (created_by = auth.uid()) bei
-- automatischen Status-Protokollen, z. B. "Erledigt auf Offen".
--
-- Phase-1/Prototype:
-- Erlaubt der App das Einfuegen von task_reports ueber anon/authenticated.
-- Vor Produktivbetrieb sollte diese Policy durch echte Auth-/Rollenregeln
-- ersetzt werden.

grant select, insert, delete on task_reports to anon, authenticated;

drop policy if exists "phase1 demo public insert task reports" on task_reports;
create policy "phase1 demo public insert task reports" on task_reports
for insert
with check (
  exists (
    select 1
    from job_tasks jt
    where jt.id = job_task_id
  )
);

drop policy if exists "phase1 demo public read task reports" on task_reports;
create policy "phase1 demo public read task reports" on task_reports
for select
using (true);

drop policy if exists "phase1 demo public delete task reports" on task_reports;
create policy "phase1 demo public delete task reports" on task_reports
for delete
using (true);
