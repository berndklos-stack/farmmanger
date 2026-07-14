alter table driver_time_entries add column if not exists locked_at timestamptz;
alter table driver_time_entries add column if not exists locked_by_id text;
alter table driver_time_entries add column if not exists locked_by_name text;

create index if not exists driver_time_entries_locked_at_idx on driver_time_entries(locked_at);
