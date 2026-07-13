-- Farm-Manager: Mandanten- und Zusammenarbeitslogik.
-- Nicht-destruktiv: erweitert bestehende Tabellen und Policies mit IF NOT EXISTS.

alter type organization_type add value if not exists 'advisor';
alter type organization_type add value if not exists 'supplier';
alter type organization_type add value if not exists 'other';

do $$
begin
  create type organization_relationship_status as enum ('invited', 'active', 'paused', 'ended', 'blocked');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type field_share_permission as enum ('view', 'use_in_jobs', 'manage');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type field_share_status as enum ('active', 'revoked');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type external_contact_kind as enum ('customer', 'contractor', 'supplier', 'other');
exception
  when duplicate_object then null;
end $$;

alter type external_contact_kind add value if not exists 'contractor';

do $$
begin
  create type external_contact_status as enum ('external', 'invited', 'linked', 'archived');
exception
  when duplicate_object then null;
end $$;

create table if not exists organization_relationships (
  id uuid primary key default gen_random_uuid(),
  farmer_organization_id uuid not null references organizations(id) on delete cascade,
  contractor_organization_id uuid not null references organizations(id) on delete cascade,
  status organization_relationship_status not null default 'invited',
  invited_by uuid references profiles(id) on delete set null,
  accepted_by uuid references profiles(id) on delete set null,
  invitation_email text,
  invitation_message text,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  ended_at timestamptz,
  notes text,
  unique (farmer_organization_id, contractor_organization_id)
);

create table if not exists field_shares (
  id uuid primary key default gen_random_uuid(),
  field_id uuid not null references fields(id) on delete cascade,
  shared_by_organization_id uuid not null references organizations(id) on delete cascade,
  shared_with_organization_id uuid not null references organizations(id) on delete cascade,
  permission field_share_permission not null default 'view',
  status field_share_status not null default 'active',
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (field_id, shared_with_organization_id)
);

create table if not exists external_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  linked_organization_id uuid references organizations(id) on delete set null,
  contact_kind external_contact_kind not null default 'customer',
  contact_type external_contact_kind not null default 'customer',
  company_name text not null,
  contact_name text,
  contact_person text,
  category text,
  phone text,
  email text,
  address text,
  organization_number text,
  customer_number text,
  status external_contact_status not null default 'external',
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

alter table organization_relationships add column if not exists invitation_email text;
alter table organization_relationships add column if not exists invitation_message text;
alter table external_contacts add column if not exists contact_type external_contact_kind not null default 'customer';
alter table external_contacts add column if not exists contact_person text;
alter table external_contacts add column if not exists organization_number text;
alter table external_contacts add column if not exists status external_contact_status not null default 'external';
alter table external_contacts add column if not exists updated_at timestamptz not null default now();

create index if not exists organization_relationships_farmer_idx on organization_relationships(farmer_organization_id, status);
create index if not exists organization_relationships_contractor_idx on organization_relationships(contractor_organization_id, status);
create index if not exists field_shares_field_idx on field_shares(field_id, status);
create index if not exists field_shares_shared_with_idx on field_shares(shared_with_organization_id, status);
create index if not exists external_contacts_organization_idx on external_contacts(organization_id, contact_kind, active);

alter table profiles add column if not exists primary_organization_id uuid references organizations(id) on delete set null;
update profiles set primary_organization_id = organization_id where primary_organization_id is null and organization_id is not null;

create table if not exists organization_memberships (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  role user_role not null default 'farmer_employee',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (profile_id, organization_id)
);

insert into organization_memberships (profile_id, organization_id, role)
select id, organization_id, role
from profiles
where organization_id is not null
on conflict (profile_id, organization_id) do nothing;

create or replace function is_member_of_organization(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from profiles p
    where p.id = auth.uid()
      and p.organization_id = target_organization_id
  )
  or exists (
    select 1
    from organization_memberships om
    where om.profile_id = auth.uid()
      and om.organization_id = target_organization_id
      and om.active = true
  )
$$;

create or replace function has_active_org_relationship(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from profiles p
    join organization_relationships rel
      on rel.status = 'active'
     and (
       (rel.farmer_organization_id = p.organization_id and rel.contractor_organization_id = target_organization_id)
       or
       (rel.contractor_organization_id = p.organization_id and rel.farmer_organization_id = target_organization_id)
     )
    where p.id = auth.uid()
  )
$$;

create or replace function can_read_organization(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select is_member_of_organization(target_organization_id)
    or has_active_org_relationship(target_organization_id)
    or exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and p.role = 'advisor'
        and exists (
          select 1 from advisor_access aa
          where aa.advisor_profile_id = p.id
            and aa.organization_id = target_organization_id
        )
    )
$$;

create or replace function can_read_field(target_field_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from fields f
    where f.id = target_field_id
      and is_member_of_organization(f.organization_id)
  )
  or exists (
    select 1
    from field_shares fs
    where fs.field_id = target_field_id
      and fs.status = 'active'
      and is_member_of_organization(fs.shared_with_organization_id)
  )
  or exists (
    select 1
    from job_fields jf
    join jobs j on j.id = jf.job_id
    where jf.field_id = target_field_id
      and (
        is_member_of_organization(j.farmer_organization_id)
        or (j.contractor_organization_id is not null and is_member_of_organization(j.contractor_organization_id))
      )
  )
$$;

alter table organization_relationships enable row level security;
alter table field_shares enable row level security;
alter table external_contacts enable row level security;
alter table organization_memberships enable row level security;

drop policy if exists "relationships read own active partners" on organization_relationships;
create policy "relationships read own active partners" on organization_relationships
for select using (
  is_member_of_organization(farmer_organization_id)
  or is_member_of_organization(contractor_organization_id)
);

drop policy if exists "relationships invite own organization" on organization_relationships;
create policy "relationships invite own organization" on organization_relationships
for insert with check (
  is_member_of_organization(farmer_organization_id)
  or is_member_of_organization(contractor_organization_id)
);

drop policy if exists "relationships update own organization" on organization_relationships;
create policy "relationships update own organization" on organization_relationships
for update using (
  is_member_of_organization(farmer_organization_id)
  or is_member_of_organization(contractor_organization_id)
) with check (
  is_member_of_organization(farmer_organization_id)
  or is_member_of_organization(contractor_organization_id)
);

drop policy if exists "field shares read involved organizations" on field_shares;
create policy "field shares read involved organizations" on field_shares
for select using (
  is_member_of_organization(shared_by_organization_id)
  or is_member_of_organization(shared_with_organization_id)
);

drop policy if exists "field shares manage owning organization" on field_shares;
create policy "field shares manage owning organization" on field_shares
for all using (
  is_member_of_organization(shared_by_organization_id)
) with check (
  is_member_of_organization(shared_by_organization_id)
);

drop policy if exists "external contacts manage own organization" on external_contacts;
create policy "external contacts manage own organization" on external_contacts
for all using (
  is_member_of_organization(organization_id)
) with check (
  is_member_of_organization(organization_id)
);

drop policy if exists "memberships read own" on organization_memberships;
create policy "memberships read own" on organization_memberships
for select using (
  profile_id = auth.uid()
  or is_member_of_organization(organization_id)
);

drop policy if exists "fields read allowed organizations" on fields;
create policy "fields read allowed organizations" on fields
for select using (can_read_field(id));

drop policy if exists "field boundaries read with field" on field_boundaries;
create policy "field boundaries read with field" on field_boundaries
for select using (can_read_field(field_id));

drop policy if exists "field hazards read with field" on field_hazards;
create policy "field hazards read with field" on field_hazards
for select using (can_read_field(field_id));

drop policy if exists "organizations read allowed" on organizations;
create policy "organizations read allowed" on organizations
for select using (can_read_organization(id));

drop policy if exists "organizations manage own" on organizations;
create policy "organizations manage own" on organizations
for update using (is_member_of_organization(id)) with check (is_member_of_organization(id));

drop policy if exists "jobs read farmer contractor advisor" on jobs;
create policy "jobs read farmer contractor advisor" on jobs
for select using (
  is_member_of_organization(farmer_organization_id)
  or (contractor_organization_id is not null and is_member_of_organization(contractor_organization_id))
);
