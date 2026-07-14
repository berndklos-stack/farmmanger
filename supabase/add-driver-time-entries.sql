create table if not exists driver_time_entries (
  id uuid primary key,
  driver_id text not null,
  driver_name text not null,
  kind text not null check (kind in ('work', 'interruption', 'pause')),
  reason text,
  note text,
  subtask_id text,
  job_number text,
  started_at timestamptz not null,
  ended_at timestamptz,
  minutes integer,
  locked_at timestamptz,
  locked_by_id text,
  locked_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table driver_time_entries add column if not exists locked_at timestamptz;
alter table driver_time_entries add column if not exists locked_by_id text;
alter table driver_time_entries add column if not exists locked_by_name text;

create index if not exists driver_time_entries_driver_id_idx on driver_time_entries(driver_id);
create index if not exists driver_time_entries_started_at_idx on driver_time_entries(started_at);
create index if not exists driver_time_entries_kind_idx on driver_time_entries(kind);
create index if not exists driver_time_entries_locked_at_idx on driver_time_entries(locked_at);

create or replace function set_driver_time_entries_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists driver_time_entries_updated_at on driver_time_entries;
create trigger driver_time_entries_updated_at
before update on driver_time_entries
for each row execute function set_driver_time_entries_updated_at();

alter table driver_time_entries enable row level security;

grant select, insert, update, delete on driver_time_entries to anon, authenticated;

drop policy if exists "phase1 demo public read driver time entries" on driver_time_entries;
create policy "phase1 demo public read driver time entries" on driver_time_entries
for select using (true);

drop policy if exists "phase1 demo public insert driver time entries" on driver_time_entries;
create policy "phase1 demo public insert driver time entries" on driver_time_entries
for insert with check (true);

drop policy if exists "phase1 demo public update driver time entries" on driver_time_entries;
create policy "phase1 demo public update driver time entries" on driver_time_entries
for update using (true) with check (true);

drop policy if exists "phase1 demo public delete driver time entries" on driver_time_entries;
create policy "phase1 demo public delete driver time entries" on driver_time_entries
for delete using (true);
