alter table jobs add column if not exists completion_status text;
alter table jobs add column if not exists completion_status_changed_at timestamptz;
alter table jobs add column if not exists completion_status_changed_by text;
alter table jobs add column if not exists invoice_number text;
alter table jobs add column if not exists invoice_date timestamptz;

alter table jobs drop constraint if exists jobs_completion_status_check;
alter table jobs
  add constraint jobs_completion_status_check
  check (completion_status is null or completion_status in ('review', 'checked', 'billable', 'invoiced'));

create index if not exists jobs_completion_status_idx on jobs (completion_status);
create index if not exists jobs_invoice_number_idx on jobs (invoice_number);
