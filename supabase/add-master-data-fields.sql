-- Farm-Manager: erweiterte Phase-1-Stammdatenfelder.
-- Erweitert bestehende Tabellen, ohne neue Hosting- oder Datenbankstruktur anzulegen.

alter table organizations add column if not exists organization_number text;
alter table organizations add column if not exists phone text;
alter table organizations add column if not exists mobile text;
alter table organizations add column if not exists email text;
alter table organizations add column if not exists website text;
alter table organizations add column if not exists vat_id text;
alter table organizations add column if not exists logo_url text;
alter table organizations add column if not exists default_language text;
alter table organizations add column if not exists billing_details text;
alter table organizations add column if not exists customer_number text;
alter table organizations add column if not exists supplier_category text;
alter table organizations add column if not exists notes text;
alter table organizations add column if not exists contacts jsonb not null default '[]'::jsonb;
alter table organizations add column if not exists archived_at timestamptz;

alter table personnel_resources add column if not exists annual_vacation_days numeric(5,2) not null default 30;
alter table personnel_resources add column if not exists vacation_used_days numeric(5,2) not null default 0;

alter table vehicles add column if not exists manufacturer text;
alter table vehicles add column if not exists model text;
alter table vehicles add column if not exists construction_year integer;
alter table vehicles add column if not exists operating_hours numeric(10,1);
alter table vehicles add column if not exists default_driver_id uuid references personnel_resources(id) on delete set null;
alter table vehicles add column if not exists archived_at timestamptz;

alter table implements add column if not exists manufacturer text;
alter table implements add column if not exists working_width numeric(8,2);
alter table implements add column if not exists archived_at timestamptz;
