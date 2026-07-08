create extension if not exists pgcrypto;

create type organization_type as enum ('farmer', 'contractor');
create type user_role as enum ('farmer_admin', 'farmer_employee', 'contractor_admin', 'driver', 'advisor', 'support_admin');
create type hazard_type as enum ('wet_area', 'stones', 'narrow_access', 'water_protection', 'other');
create type job_status as enum ('draft', 'open', 'scheduled', 'in_progress', 'completed', 'cancelled', 'problem');
create type job_priority as enum ('low', 'normal', 'high', 'urgent');
create type work_mode as enum ('single', 'team', 'role_based', 'area_split');
create type progress_type as enum ('area', 'quantity', 'trips', 'time');
create type task_status as enum ('open', 'reserved', 'active', 'paused', 'partial', 'completed', 'problem', 'released');
create type assignment_status as enum ('reserved', 'active', 'paused', 'completed', 'released');
create type report_type as enum ('progress', 'issue', 'completion');

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  organization_type organization_type not null,
  address text,
  created_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  role user_role not null default 'farmer_employee',
  organization_id uuid references organizations(id) on delete set null,
  created_at timestamptz not null default now()
);

create table advisor_access (
  id uuid primary key default gen_random_uuid(),
  advisor_profile_id uuid not null references profiles(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (advisor_profile_id, organization_id)
);

create table fields (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  area_ha numeric(10,2) not null default 0,
  crop text,
  ownership_type text check (ownership_type in ('owned', 'lease')),
  center_lat double precision,
  center_lng double precision,
  access_lat double precision,
  access_lng double precision,
  access_description text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table field_boundaries (
  id uuid primary key default gen_random_uuid(),
  field_id uuid not null references fields(id) on delete cascade,
  points_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table field_hazards (
  id uuid primary key default gen_random_uuid(),
  field_id uuid not null references fields(id) on delete cascade,
  hazard_type hazard_type not null,
  title text not null,
  description text,
  lat double precision,
  lng double precision,
  photo_url text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table jobs (
  id uuid primary key default gen_random_uuid(),
  job_number text unique,
  farmer_organization_id uuid not null references organizations(id) on delete cascade,
  contractor_organization_id uuid references organizations(id) on delete set null,
  title text not null,
  description text,
  planned_start timestamptz,
  planned_end timestamptz,
  priority job_priority not null default 'normal',
  status job_status not null default 'open',
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table job_fields (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  field_id uuid not null references fields(id) on delete cascade,
  notes text,
  access_notes text,
  unique (job_id, field_id)
);

create table job_tasks (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  field_id uuid references fields(id) on delete cascade,
  task_type text not null,
  title text not null,
  description text,
  work_mode work_mode not null default 'single',
  progress_type progress_type not null default 'area',
  target_area_ha numeric(10,2),
  target_quantity numeric(12,2),
  quantity_unit text,
  target_trips integer,
  max_active_workers integer not null default 1 check (max_active_workers > 0),
  status task_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table task_assignments (
  id uuid primary key default gen_random_uuid(),
  job_task_id uuid not null references job_tasks(id) on delete cascade,
  driver_profile_id uuid not null references profiles(id) on delete cascade,
  vehicle_name text,
  status assignment_status not null default 'reserved',
  started_at timestamptz,
  completed_at timestamptz,
  completed_area_ha numeric(10,2),
  completed_quantity numeric(12,2),
  completed_trips integer,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_task_id, driver_profile_id)
);

create table task_reports (
  id uuid primary key default gen_random_uuid(),
  job_task_id uuid not null references job_tasks(id) on delete cascade,
  assignment_id uuid references task_assignments(id) on delete set null,
  report_type report_type not null,
  message text,
  area_ha numeric(10,2),
  quantity numeric(12,2),
  trips integer,
  photo_url text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  field_id uuid references fields(id) on delete cascade,
  job_id uuid references jobs(id) on delete cascade,
  job_task_id uuid references job_tasks(id) on delete cascade,
  file_name text not null,
  file_path text not null,
  file_type text,
  uploaded_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index fields_organization_id_idx on fields(organization_id);
create index field_hazards_field_id_idx on field_hazards(field_id);
create index jobs_farmer_contractor_idx on jobs(farmer_organization_id, contractor_organization_id);
create index job_tasks_job_id_idx on job_tasks(job_id);
create index task_assignments_task_status_idx on task_assignments(job_task_id, status);

create or replace function current_profile()
returns profiles
language sql
stable
security definer
set search_path = public
as $$
  select * from profiles where id = auth.uid()
$$;

create or replace function can_read_organization(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and (
        p.organization_id = target_organization_id
        or (
          p.role = 'advisor'
          and exists (
            select 1 from advisor_access aa
            where aa.advisor_profile_id = p.id
              and aa.organization_id = target_organization_id
          )
        )
      )
  )
$$;

create or replace function current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id from profiles where id = auth.uid()
$$;

create or replace function current_user_role()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from profiles where id = auth.uid()
$$;

alter table organizations enable row level security;
alter table profiles enable row level security;
alter table advisor_access enable row level security;
alter table fields enable row level security;
alter table field_boundaries enable row level security;
alter table field_hazards enable row level security;
alter table jobs enable row level security;
alter table job_fields enable row level security;
alter table job_tasks enable row level security;
alter table task_assignments enable row level security;
alter table task_reports enable row level security;
alter table documents enable row level security;

create policy "profiles read own organization" on profiles
for select using (
  id = auth.uid()
  or organization_id = current_organization_id()
);

create policy "profiles update own row" on profiles
for update using (id = auth.uid()) with check (id = auth.uid());

create policy "organizations read allowed" on organizations
for select using (can_read_organization(id));

create policy "advisor access read own" on advisor_access
for select using (
  advisor_profile_id = auth.uid()
  or can_read_organization(organization_id)
);

create policy "fields read allowed organizations" on fields
for select using (can_read_organization(organization_id));

create policy "farmer admins manage own fields" on fields
for all using (
  organization_id = current_organization_id()
  and current_user_role() in ('farmer_admin', 'farmer_employee')
) with check (
  organization_id = current_organization_id()
  and current_user_role() in ('farmer_admin', 'farmer_employee')
);

create policy "field boundaries read with field" on field_boundaries
for select using (
  exists (select 1 from fields f where f.id = field_id and can_read_organization(f.organization_id))
);

create policy "field boundaries manage own farmer fields" on field_boundaries
for all using (
  exists (
    select 1 from fields f
    where f.id = field_id
      and f.organization_id = current_organization_id()
      and current_user_role() in ('farmer_admin', 'farmer_employee')
  )
) with check (
  exists (
    select 1 from fields f
    where f.id = field_id
      and f.organization_id = current_organization_id()
      and current_user_role() in ('farmer_admin', 'farmer_employee')
  )
);

create policy "field hazards read with field" on field_hazards
for select using (
  exists (select 1 from fields f where f.id = field_id and can_read_organization(f.organization_id))
);

create policy "field hazards create for visible field" on field_hazards
for insert with check (
  created_by = auth.uid()
  and exists (select 1 from fields f where f.id = field_id and can_read_organization(f.organization_id))
);

create policy "jobs read farmer contractor advisor" on jobs
for select using (
  can_read_organization(farmer_organization_id)
  or (contractor_organization_id is not null and can_read_organization(contractor_organization_id))
);

create policy "farmer admins manage own jobs" on jobs
for all using (
  farmer_organization_id = current_organization_id()
  and current_user_role() in ('farmer_admin', 'farmer_employee')
) with check (
  farmer_organization_id = current_organization_id()
  and current_user_role() in ('farmer_admin', 'farmer_employee')
);

create policy "job fields read visible jobs" on job_fields
for select using (
  exists (
    select 1 from jobs j
    where j.id = job_id
      and (can_read_organization(j.farmer_organization_id) or can_read_organization(j.contractor_organization_id))
  )
);

create policy "job tasks read visible jobs" on job_tasks
for select using (
  exists (
    select 1 from jobs j
    where j.id = job_id
      and (can_read_organization(j.farmer_organization_id) or can_read_organization(j.contractor_organization_id))
  )
);

create policy "contractor admins manage assigned job tasks" on job_tasks
for update using (
  exists (
    select 1 from jobs j
    where j.id = job_id
      and j.contractor_organization_id = current_organization_id()
      and current_user_role() = 'contractor_admin'
  )
);

create policy "assignments read visible job tasks" on task_assignments
for select using (
  driver_profile_id = auth.uid()
  or exists (
    select 1 from job_tasks jt
    join jobs j on j.id = jt.job_id
    where jt.id = job_task_id
      and (can_read_organization(j.farmer_organization_id) or can_read_organization(j.contractor_organization_id))
  )
);

create policy "drivers update own assignments" on task_assignments
for update using (driver_profile_id = auth.uid()) with check (driver_profile_id = auth.uid());

create policy "contractor admins manage assignments" on task_assignments
for all using (
  exists (
    select 1 from job_tasks jt
    join jobs j on j.id = jt.job_id
    where jt.id = job_task_id
      and j.contractor_organization_id = current_organization_id()
      and current_user_role() = 'contractor_admin'
  )
) with check (
  exists (
    select 1 from job_tasks jt
    join jobs j on j.id = jt.job_id
    where jt.id = job_task_id
      and j.contractor_organization_id = current_organization_id()
      and current_user_role() = 'contractor_admin'
  )
);

create policy "task reports read visible tasks" on task_reports
for select using (
  created_by = auth.uid()
  or exists (
    select 1 from job_tasks jt
    join jobs j on j.id = jt.job_id
    where jt.id = job_task_id
      and (can_read_organization(j.farmer_organization_id) or can_read_organization(j.contractor_organization_id))
  )
);

create policy "task reports insert own" on task_reports
for insert with check (created_by = auth.uid());

create policy "documents read own organization or linked work" on documents
for select using (
  organization_id is not null and can_read_organization(organization_id)
);

create policy "documents insert own organization" on documents
for insert with check (
  uploaded_by = auth.uid()
  and organization_id = current_organization_id()
);

create or replace function claim_job_task(
  p_job_task_id uuid,
  p_vehicle_name text default null
)
returns task_assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task job_tasks%rowtype;
  v_profile profiles%rowtype;
  v_active_count integer;
  v_assignment task_assignments%rowtype;
begin
  select * into v_profile from profiles where id = auth.uid();
  if v_profile.id is null then
    raise exception 'Kein angemeldeter Benutzer.';
  end if;

  select * into v_task from job_tasks where id = p_job_task_id for update;
  if v_task.id is null then
    raise exception 'Teilauftrag nicht gefunden.';
  end if;

  if exists (
    select 1 from task_assignments
    where job_task_id = p_job_task_id
      and driver_profile_id = auth.uid()
      and status in ('reserved', 'active')
  ) then
    raise exception 'Dieser Fahrer ist bereits angemeldet.';
  end if;

  select count(*) into v_active_count
  from task_assignments
  where job_task_id = p_job_task_id
    and status in ('reserved', 'active');

  if v_task.work_mode = 'single' and v_active_count >= 1 then
    raise exception 'Dieser Einzelmodus-Teilauftrag ist bereits belegt.';
  end if;

  if v_active_count >= v_task.max_active_workers then
    raise exception 'Keine freien Plätze mehr verfügbar.';
  end if;

  insert into task_assignments (
    job_task_id,
    driver_profile_id,
    vehicle_name,
    status,
    started_at
  )
  values (
    p_job_task_id,
    auth.uid(),
    p_vehicle_name,
    'reserved',
    now()
  )
  returning * into v_assignment;

  update job_tasks
  set status = case when v_task.work_mode = 'single' then 'reserved' else 'active' end,
      updated_at = now()
  where id = p_job_task_id;

  return v_assignment;
end;
$$;

grant execute on function claim_job_task(uuid, text) to authenticated;

insert into storage.buckets (id, name, public)
values
  ('field-photos', 'field-photos', false),
  ('job-documents', 'job-documents', false),
  ('task-reports', 'task-reports', false)
on conflict (id) do nothing;

create policy "storage read own organization files" on storage.objects
for select using (
  bucket_id in ('field-photos', 'job-documents', 'task-reports')
  and auth.role() = 'authenticated'
);

create policy "storage upload authenticated" on storage.objects
for insert with check (
  bucket_id in ('field-photos', 'job-documents', 'task-reports')
  and auth.role() = 'authenticated'
);
