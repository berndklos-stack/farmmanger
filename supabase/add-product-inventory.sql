-- Farm-Manager: Betriebsmittel/Produkte und Bestandsbuchungen zentral speichern.
-- Safe to run more than once.
--
-- Phase 1 nutzt dieselben offenen Policies wie die bestehenden Phase-1-Tabellen.
-- Vor einem haerteren Produktivbetrieb sollten diese Policies auf Rollen/Organisationen
-- eingeschraenkt werden.

create table if not exists product_inventory (
  id text primary key,
  organization_id text,
  name text not null,
  category text not null default '',
  unit text not null default 'Stk',
  supplier_name text,
  article_number text,
  photo_url text,
  photo_name text,
  currency text not null default 'SEK',
  purchase_price numeric,
  sales_price numeric,
  purchase_price_valid_from date,
  purchase_price_valid_to date,
  sales_price_valid_from date,
  sales_price_valid_to date,
  opening_stock numeric not null default 0,
  minimum_stock numeric,
  package_unit text,
  quantity_per_package numeric,
  notes text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists product_movements (
  id text primary key,
  product_id text not null references product_inventory(id) on delete cascade,
  movement_type text not null check (movement_type in ('in', 'out')),
  quantity numeric not null,
  package_count numeric,
  package_quantity numeric,
  opened_package_count numeric,
  opened_package_quantity numeric,
  booked_at date not null,
  booked_by_id text,
  booked_by_name text,
  job_id text,
  job_label text,
  currency text not null default 'SEK',
  purchase_price numeric,
  note text,
  correction_of_movement_id text,
  documents jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists product_inventory_organization_id_idx on product_inventory(organization_id);
create index if not exists product_inventory_archived_at_idx on product_inventory(archived_at);
create index if not exists product_movements_product_id_idx on product_movements(product_id);
create index if not exists product_movements_booked_at_idx on product_movements(booked_at);

create or replace function set_product_inventory_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists product_inventory_updated_at on product_inventory;
create trigger product_inventory_updated_at
before update on product_inventory
for each row execute function set_product_inventory_updated_at();

create or replace function set_product_movements_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists product_movements_updated_at on product_movements;
create trigger product_movements_updated_at
before update on product_movements
for each row execute function set_product_movements_updated_at();

alter table product_inventory enable row level security;
alter table product_movements enable row level security;

grant select, insert, update, delete on product_inventory to anon, authenticated;
grant select, insert, update, delete on product_movements to anon, authenticated;

drop policy if exists "phase1 demo public read product inventory" on product_inventory;
create policy "phase1 demo public read product inventory" on product_inventory
for select using (true);

drop policy if exists "phase1 demo public insert product inventory" on product_inventory;
create policy "phase1 demo public insert product inventory" on product_inventory
for insert with check (true);

drop policy if exists "phase1 demo public update product inventory" on product_inventory;
create policy "phase1 demo public update product inventory" on product_inventory
for update using (true) with check (true);

drop policy if exists "phase1 demo public delete product inventory" on product_inventory;
create policy "phase1 demo public delete product inventory" on product_inventory
for delete using (true);

drop policy if exists "phase1 demo public read product movements" on product_movements;
create policy "phase1 demo public read product movements" on product_movements
for select using (true);

drop policy if exists "phase1 demo public insert product movements" on product_movements;
create policy "phase1 demo public insert product movements" on product_movements
for insert with check (true);

drop policy if exists "phase1 demo public update product movements" on product_movements;
create policy "phase1 demo public update product movements" on product_movements
for update using (true) with check (true);

drop policy if exists "phase1 demo public delete product movements" on product_movements;
create policy "phase1 demo public delete product movements" on product_movements
for delete using (true);
