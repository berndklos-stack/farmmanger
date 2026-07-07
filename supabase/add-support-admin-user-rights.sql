-- Benutzer-Rechteverwaltung fuer Support Admins.
-- Erlaubt Support Admins, Rollen, Betriebszuordnung und sichtbare Bereiche in profiles zu pflegen.
-- Kann gefahrlos mehrfach ausgefuehrt werden.

alter type user_role add value if not exists 'support_admin';

alter table profiles
  add column if not exists allowed_modules text[] not null default '{}';

alter table profiles
  add column if not exists allowed_views text[] not null default '{}';

grant select, insert, update on profiles to anon, authenticated;

drop policy if exists "support admins update profiles" on profiles;
create policy "support admins update profiles" on profiles
for update
using (current_user_role() = 'support_admin')
with check (current_user_role() = 'support_admin');

drop policy if exists "support admins insert profiles" on profiles;
create policy "support admins insert profiles" on profiles
for insert
with check (current_user_role() = 'support_admin');
