-- Farm-Manager Vertriebsdemo: zwei Lohnunternehmer, zwei Landwirte,
-- Kundenlisten, Stammdaten und gemischte Auftraege mit und ohne Flaechenbezug.
-- Idempotent: kann erneut ausgefuehrt werden, ohne Dubletten anzulegen.

create extension if not exists pgcrypto;

create or replace function public.fm_demo_uuid(seed text)
returns uuid
language sql
immutable
as $$
  select (
    substr(hash, 1, 8) || '-' ||
    substr(hash, 9, 4) || '-4' ||
    substr(hash, 14, 3) || '-8' ||
    substr(hash, 17, 3) || '-' ||
    substr(hash, 20, 12)
  )::uuid
  from (select md5(seed) as hash) value;
$$;

insert into organizations (
  id, name, organization_type, address, organization_number, phone, mobile, email,
  website, default_language, billing_details, notes, contacts, archived_at
)
values
  (
    fm_demo_uuid('sales-demo:org:contractor:20'),
    'Ramsjö Maskinservice AB',
    'contractor',
    'Ramsjövägen 18, 382 95 Nybro, SE',
    '559210-2044',
    '+46 481 220 10',
    '+46 70 220 10 20',
    'demo20@farm-manager.app',
    'https://ramsjo-maskin.example',
    'sv',
    'SEK, 30 Tage netto, Referenz je Auftrag',
    'Vertriebsdemo: Lohnunternehmer mit 20 aktiven Kunden.',
    '[{"name":"Anna Ramsjö","role":"Einsatzleitung","phone":"+46 70 220 10 20","email":"anna@ramsjo-maskin.example"},{"name":"Mikael Ramsjö","role":"Werkstatt","phone":"+46 70 220 10 21","email":"verkstad@ramsjo-maskin.example"}]'::jsonb,
    null
  ),
  (
    fm_demo_uuid('sales-demo:org:contractor:3'),
    'Klos Agrar & Transport',
    'contractor',
    'Kolaretorp 7, 382 93 Nybro, SE',
    '559290-6677',
    '+46 481 330 44',
    '+46 70 330 44 55',
    'demo3@farm-manager.app',
    'https://klos-agrar.example',
    'de',
    'SEK, monatliche Sammelrechnung',
    'Vertriebsdemo: kleiner Lohnunternehmer mit 3 aktiven Kunden.',
    '[{"name":"Bernd Klos","role":"Inhaber","phone":"+46 70 330 44 55","email":"bernd@klos-agrar.example"}]'::jsonb,
    null
  ),
  (
    fm_demo_uuid('sales-demo:org:farmer:pm-ramsjo'),
    'P & M Ramsjö Gård',
    'farmer',
    'Ramsjö Gård 1, 382 95 Nybro, SE',
    '750318-4490',
    '+46 481 410 11',
    '+46 70 410 11 22',
    'pm.ramsjo@farm-manager.app',
    null,
    'sv',
    'Kundennummer RG-1001, Sammelrechnung je Monat',
    'Vertriebsdemo-Landwirt mit Feld- und Serviceauftraegen.',
    '[{"name":"Peter Ramsjö","role":"Betriebsleiter","phone":"+46 70 410 11 22","email":"peter@ramsjo-gard.example"},{"name":"Maria Ramsjö","role":"Buchhaltung","phone":"+46 70 410 11 23","email":"maria@ramsjo-gard.example"}]'::jsonb,
    null
  ),
  (
    fm_demo_uuid('sales-demo:org:farmer:lindstrom'),
    'Hof Lindström Demo',
    'farmer',
    'Lindström 4, 364 92 Lenhovda, SE',
    '801204-1122',
    '+46 474 550 12',
    '+46 70 550 12 13',
    'lindstrom@farm-manager.app',
    null,
    'de',
    'Kundennummer LD-2002, Zahlungsziel 14 Tage',
    'Vertriebsdemo-Landwirt mit Gruenland, Ackerbau und Hofdienstleistungen.',
    '[{"name":"Erik Lindström","role":"Eigentümer","phone":"+46 70 550 12 13","email":"erik@lindstrom.example"}]'::jsonb,
    null
  )
on conflict (id) do update set
  name = excluded.name,
  organization_type = excluded.organization_type,
  address = excluded.address,
  organization_number = excluded.organization_number,
  phone = excluded.phone,
  mobile = excluded.mobile,
  email = excluded.email,
  website = excluded.website,
  default_language = excluded.default_language,
  billing_details = excluded.billing_details,
  notes = excluded.notes,
  contacts = excluded.contacts,
  archived_at = excluded.archived_at;

insert into organization_relationships (
  id, farmer_organization_id, contractor_organization_id, status, invitation_email,
  invitation_message, created_at, accepted_at, notes
)
select
  fm_demo_uuid('sales-demo:relationship:' || farmer_key || ':' || contractor_key),
  farmer_id,
  contractor_id,
  'active'::organization_relationship_status,
  farmer_email,
  'Vertriebsdemo: Zusammenarbeit aktiv, damit Auftraege und Flaechen sichtbar sind.',
  now() - interval '12 days',
  now() - interval '11 days',
  'Automatisch fuer Vertriebsdemo angelegt.'
from (
  values
    ('pm', 'big', fm_demo_uuid('sales-demo:org:farmer:pm-ramsjo'), fm_demo_uuid('sales-demo:org:contractor:20'), 'pm.ramsjo@farm-manager.app'),
    ('pm', 'small', fm_demo_uuid('sales-demo:org:farmer:pm-ramsjo'), fm_demo_uuid('sales-demo:org:contractor:3'), 'pm.ramsjo@farm-manager.app'),
    ('lindstrom', 'big', fm_demo_uuid('sales-demo:org:farmer:lindstrom'), fm_demo_uuid('sales-demo:org:contractor:20'), 'lindstrom@farm-manager.app'),
    ('lindstrom', 'small', fm_demo_uuid('sales-demo:org:farmer:lindstrom'), fm_demo_uuid('sales-demo:org:contractor:3'), 'lindstrom@farm-manager.app')
) rel(farmer_key, contractor_key, farmer_id, contractor_id, farmer_email)
on conflict (farmer_organization_id, contractor_organization_id) do update set
  status = excluded.status,
  invitation_email = excluded.invitation_email,
  invitation_message = excluded.invitation_message,
  accepted_at = excluded.accepted_at,
  ended_at = null,
  notes = excluded.notes;

insert into external_contacts (
  id, organization_id, linked_organization_id, contact_kind, contact_type, company_name,
  contact_name, contact_person, category, phone, email, address, organization_number,
  customer_number, status, notes, active, archived_at
)
select
  fm_demo_uuid('sales-demo:contact:big:' || row_number),
  fm_demo_uuid('sales-demo:org:contractor:20'),
  linked_org,
  'customer'::external_contact_kind,
  'customer'::external_contact_kind,
  company_name,
  contact_person,
  contact_person,
  'Landwirtschaft',
  phone,
  email,
  address,
  organization_number,
  'RMS-' || lpad(row_number::text, 3, '0'),
  case when linked_org is null then 'external'::external_contact_status else 'linked'::external_contact_status end,
  'Vertriebsdemo Kunde ' || row_number || ' von Ramsjö Maskinservice.',
  true,
  null
from (
  values
    (1, 'P & M Ramsjö Gård', 'Peter Ramsjö', '+46 70 410 11 22', 'pm.ramsjo@farm-manager.app', 'Ramsjö Gård 1, Nybro', '750318-4490', fm_demo_uuid('sales-demo:org:farmer:pm-ramsjo')),
    (2, 'Hof Lindström Demo', 'Erik Lindström', '+46 70 550 12 13', 'lindstrom@farm-manager.app', 'Lindström 4, Lenhovda', '801204-1122', fm_demo_uuid('sales-demo:org:farmer:lindstrom')),
    (3, 'Björkebo Lantbruk', 'Sara Björk', '+46 70 101 20 03', 'sara@bjorkebo.example', 'Björkebo 3, Nybro', '661102-1103', null),
    (4, 'Södra Hagen AB', 'Johan Hagen', '+46 70 101 20 04', 'johan@sodra-hagen.example', 'Hagen 12, Emmaboda', '559112-1004', null),
    (5, 'Ängadal Gård', 'Karin Äng', '+46 70 101 20 05', 'karin@angadal.example', 'Ängadal 5, Kalmar', '720404-1005', null),
    (6, 'Kolaretorp Växtodling', 'Nils Pettersson', '+46 70 101 20 06', 'nils@kolaretorp.example', 'Kolaretorp 9, Nybro', '680606-1006', null),
    (7, 'Lilla Maden', 'Oskar Maden', '+46 70 101 20 07', 'oskar@maden.example', 'Maden 2, Torsås', '700707-1007', null),
    (8, 'Kulla Mjölk', 'Linda Kulla', '+46 70 101 20 08', 'linda@kulla.example', 'Kulla 8, Lessebo', '741108-1008', null),
    (9, 'Västra Ekeby', 'Mats Ekeby', '+46 70 101 20 09', 'mats@ekeby.example', 'Ekeby 21, Nybro', '690909-1009', null),
    (10, 'Torpet Vall AB', 'Elin Vall', '+46 70 101 20 10', 'elin@vall.example', 'Torpet 1, Växjö', '559234-1010', null),
    (11, 'Ryds Skogsbruk', 'Per Ryd', '+46 70 101 20 11', 'per@ryd.example', 'Ryd 17, Uppvidinge', '650111-1011', null),
    (12, 'Hagby Spannmål', 'Anton Hagby', '+46 70 101 20 12', 'anton@hagby.example', 'Hagby 14, Kalmar', '559234-1012', null),
    (13, 'Målerås Lantbruk', 'Frida Målerås', '+46 70 101 20 13', 'frida@maleras.example', 'Målerås 6, Nybro', '780213-1013', null),
    (14, 'Östra Bro Gård', 'Viktor Bro', '+46 70 101 20 14', 'viktor@bro.example', 'Bro 4, Emmaboda', '760314-1014', null),
    (15, 'Grönkulla Entreprenad', 'Leo Grön', '+46 70 101 20 15', 'leo@gronkulla.example', 'Grönkulla 2, Nybro', '559234-1015', null),
    (16, 'Skruv Säteri', 'Helena Skruv', '+46 70 101 20 16', 'helena@skruv.example', 'Säterivägen 1, Skruv', '730516-1016', null),
    (17, 'Långasjö Egendom', 'Axel Sjö', '+46 70 101 20 17', 'axel@langasjo.example', 'Långasjö 7, Emmaboda', '710617-1017', null),
    (18, 'Fagerhult Potatis', 'Moa Fager', '+46 70 101 20 18', 'moa@fagerhult.example', 'Fagerhult 3, Nybro', '559234-1018', null),
    (19, 'Nybro Agrohandel', 'Henrik Agro', '+46 70 101 20 19', 'henrik@nybroagro.example', 'Industrigatan 4, Nybro', '559234-1019', null),
    (20, 'Alsterbro Vallservice', 'Ida Alster', '+46 70 101 20 20', 'ida@alsterbro.example', 'Alsterbro 10, Nybro', '790820-1020', null)
) contacts(row_number, company_name, contact_person, phone, email, address, organization_number, linked_org)
on conflict (id) do update set
  organization_id = excluded.organization_id,
  linked_organization_id = excluded.linked_organization_id,
  contact_kind = excluded.contact_kind,
  contact_type = excluded.contact_type,
  company_name = excluded.company_name,
  contact_name = excluded.contact_name,
  contact_person = excluded.contact_person,
  category = excluded.category,
  phone = excluded.phone,
  email = excluded.email,
  address = excluded.address,
  organization_number = excluded.organization_number,
  customer_number = excluded.customer_number,
  status = excluded.status,
  notes = excluded.notes,
  active = excluded.active,
  archived_at = excluded.archived_at,
  updated_at = now();

insert into external_contacts (
  id, organization_id, linked_organization_id, contact_kind, contact_type, company_name,
  contact_name, contact_person, category, phone, email, address, organization_number,
  customer_number, status, notes, active, archived_at
)
select
  fm_demo_uuid('sales-demo:contact:small:' || row_number),
  fm_demo_uuid('sales-demo:org:contractor:3'),
  linked_org,
  'customer'::external_contact_kind,
  'customer'::external_contact_kind,
  company_name,
  contact_person,
  contact_person,
  'Landwirtschaft',
  phone,
  email,
  address,
  organization_number,
  'KAT-' || lpad(row_number::text, 3, '0'),
  case when linked_org is null then 'external'::external_contact_status else 'linked'::external_contact_status end,
  'Vertriebsdemo Kunde ' || row_number || ' von Klos Agrar & Transport.',
  true,
  null
from (
  values
    (1, 'P & M Ramsjö Gård', 'Peter Ramsjö', '+46 70 410 11 22', 'pm.ramsjo@farm-manager.app', 'Ramsjö Gård 1, Nybro', '750318-4490', fm_demo_uuid('sales-demo:org:farmer:pm-ramsjo')),
    (2, 'Hof Lindström Demo', 'Erik Lindström', '+46 70 550 12 13', 'lindstrom@farm-manager.app', 'Lindström 4, Lenhovda', '801204-1122', fm_demo_uuid('sales-demo:org:farmer:lindstrom')),
    (3, 'Nybro Agrohandel', 'Henrik Agro', '+46 70 101 20 19', 'henrik@nybroagro.example', 'Industrigatan 4, Nybro', '559234-1019', null)
) contacts(row_number, company_name, contact_person, phone, email, address, organization_number, linked_org)
on conflict (id) do update set
  organization_id = excluded.organization_id,
  linked_organization_id = excluded.linked_organization_id,
  company_name = excluded.company_name,
  contact_name = excluded.contact_name,
  contact_person = excluded.contact_person,
  phone = excluded.phone,
  email = excluded.email,
  address = excluded.address,
  organization_number = excluded.organization_number,
  customer_number = excluded.customer_number,
  status = excluded.status,
  notes = excluded.notes,
  active = excluded.active,
  archived_at = excluded.archived_at,
  updated_at = now();

insert into external_contacts (
  id, organization_id, contact_kind, contact_type, company_name, contact_person,
  category, phone, email, address, organization_number, status, notes, active, archived_at
)
select
  fm_demo_uuid('sales-demo:supplier:' || owner_key || ':' || row_number),
  owner_id,
  'supplier'::external_contact_kind,
  'supplier'::external_contact_kind,
  company_name,
  contact_person,
  category,
  phone,
  email,
  address,
  organization_number,
  'external'::external_contact_status,
  'Vertriebsdemo Lieferant.',
  true,
  null
from (
  values
    ('big', 1, fm_demo_uuid('sales-demo:org:contractor:20'), 'Swedish Agro', 'Lena Agro', 'Betriebsmittel', '+46 40 600 10', 'order@swedishagro.example', 'Agrovägen 1, Kalmar', '559100-2201'),
    ('big', 2, fm_demo_uuid('sales-demo:org:contractor:20'), 'Maskinservice Nybro', 'Olle Service', 'Werkstatt', '+46 481 700 20', 'verkstad@nybroservice.example', 'Industrigatan 9, Nybro', '559100-2202'),
    ('small', 1, fm_demo_uuid('sales-demo:org:contractor:3'), 'Swedish Agro', 'Lena Agro', 'Betriebsmittel', '+46 40 600 10', 'order@swedishagro.example', 'Agrovägen 1, Kalmar', '559100-2201'),
    ('small', 2, fm_demo_uuid('sales-demo:org:contractor:3'), 'Hydraulik & Slang AB', 'Nora Slang', 'Ersatzteile', '+46 481 730 30', 'info@hydraulik.example', 'Verkstadsvägen 5, Nybro', '559100-2203')
) suppliers(owner_key, row_number, owner_id, company_name, contact_person, category, phone, email, address, organization_number)
on conflict (id) do update set
  organization_id = excluded.organization_id,
  company_name = excluded.company_name,
  contact_person = excluded.contact_person,
  category = excluded.category,
  phone = excluded.phone,
  email = excluded.email,
  address = excluded.address,
  organization_number = excluded.organization_number,
  status = excluded.status,
  notes = excluded.notes,
  active = excluded.active,
  archived_at = excluded.archived_at,
  updated_at = now();

insert into personnel_resources (
  id, organization_id, full_name, email, access_password, vehicle_name, job_visibility,
  mobile, license_classes, max_daily_hours, annual_vacation_days, vacation_used_days,
  resource_type, operation_type, archived_at
)
select
  fm_demo_uuid('sales-demo:personnel:' || owner_key || ':' || row_number),
  owner_id,
  full_name,
  email,
  'farm-manager-demo',
  vehicle_name,
  job_visibility,
  mobile,
  license_classes,
  max_daily_hours,
  annual_vacation_days,
  vacation_used_days,
  resource_type,
  operation_type,
  null
from (
  values
    ('big', 1, fm_demo_uuid('sales-demo:org:contractor:20'), 'Anna Ramsjö', 'anna.driver@farm-manager.app', 'Fendt 942 Vario', 'contractor_all', '+46 70 220 10 20', array['B','T','CE'], 10, 30, 4, 'Personal', 'Einsatzleitung'),
    ('big', 2, fm_demo_uuid('sales-demo:org:contractor:20'), 'Mikael Ramsjö', 'mikael.driver@farm-manager.app', 'Volvo L90H', 'contractor_all', '+46 70 220 10 21', array['B','T','CE'], 10, 30, 3, 'Personal', 'Werkstatt'),
    ('big', 3, fm_demo_uuid('sales-demo:org:contractor:20'), 'Jens Holm', 'jens.holm@farm-manager.app', 'John Deere 6250R', 'assigned_only', '+46 70 220 10 22', array['B','T'], 9, 30, 1, 'Personal', 'Gülle'),
    ('big', 4, fm_demo_uuid('sales-demo:org:contractor:20'), 'Lisa Berg', 'lisa.berg@farm-manager.app', 'Claas Jaguar 970', 'assigned_only', '+46 70 220 10 23', array['B','T'], 8, 30, 6, 'Personal', 'Grünland'),
    ('big', 5, fm_demo_uuid('sales-demo:org:contractor:20'), 'Olof Nilsson', 'olof.nilsson@farm-manager.app', 'MAN Agrar-LKW', 'assigned_only', '+46 70 220 10 24', array['B','CE'], 9, 30, 2, 'Personal', 'Transport'),
    ('big', 6, fm_demo_uuid('sales-demo:org:contractor:20'), 'Sara Lund', 'sara.lund@farm-manager.app', 'Fendt 724 Profi', 'assigned_only', '+46 70 220 10 25', array['B','T'], 8, 30, 8, 'Personal', 'Saat'),
    ('small', 1, fm_demo_uuid('sales-demo:org:contractor:3'), 'Bernd Klos', 'bernd.demo@farm-manager.app', 'Valtra N175', 'contractor_all', '+46 70 330 44 55', array['B','T','CE'], 10, 30, 5, 'Personal', 'Einsatzleitung'),
    ('small', 2, fm_demo_uuid('sales-demo:org:contractor:3'), 'Tobias Klos', 'tobias.demo@farm-manager.app', 'Fendt 516', 'assigned_only', '+46 70 330 44 56', array['B','T'], 8, 30, 2, 'Personal', 'Feldarbeit'),
    ('farmer-pm', 1, fm_demo_uuid('sales-demo:org:farmer:pm-ramsjo'), 'Peter Ramsjö', 'peter.ramsjo@farm-manager.app', 'Hofschlepper Ramsjö', 'organization_internal', '+46 70 410 11 22', array['B','T'], 8, 30, 7, 'Administratives Personal', 'Betriebsleitung'),
    ('farmer-lindstrom', 1, fm_demo_uuid('sales-demo:org:farmer:lindstrom'), 'Erik Lindström', 'erik.lindstrom@farm-manager.app', 'Hofschlepper Lindström', 'organization_internal', '+46 70 550 12 13', array['B','T'], 8, 30, 4, 'Administratives Personal', 'Betriebsleitung')
) p(owner_key, row_number, owner_id, full_name, email, vehicle_name, job_visibility, mobile, license_classes, max_daily_hours, annual_vacation_days, vacation_used_days, resource_type, operation_type)
on conflict (id) do update set
  organization_id = excluded.organization_id,
  full_name = excluded.full_name,
  email = excluded.email,
  access_password = excluded.access_password,
  vehicle_name = excluded.vehicle_name,
  job_visibility = excluded.job_visibility,
  mobile = excluded.mobile,
  license_classes = excluded.license_classes,
  max_daily_hours = excluded.max_daily_hours,
  annual_vacation_days = excluded.annual_vacation_days,
  vacation_used_days = excluded.vacation_used_days,
  resource_type = excluded.resource_type,
  operation_type = excluded.operation_type,
  archived_at = excluded.archived_at,
  updated_at = now();

insert into vehicles (
  id, organization_id, name, vehicle_type, license_plate, manufacturer, model,
  construction_year, operating_hours, resource_type, operation_type, status, archived_at
)
select
  fm_demo_uuid('sales-demo:vehicle:' || owner_key || ':' || row_number),
  owner_id, name, vehicle_type, license_plate, manufacturer, model,
  construction_year, operating_hours, resource_type, operation_type, status::resource_status, null
from (
  values
    ('big', 1, fm_demo_uuid('sales-demo:org:contractor:20'), 'Fendt 942 Vario', 'Schlepper', 'RMS 942', 'Fendt', '942 Vario', 2022, 1840, 'Zugmaschine', 'Schwerzug', 'frei'),
    ('big', 2, fm_demo_uuid('sales-demo:org:contractor:20'), 'John Deere 6250R', 'Schlepper', 'RMS 625', 'John Deere', '6250R', 2021, 2310, 'Zugmaschine', 'Gülle/Saat', 'zugewiesen'),
    ('big', 3, fm_demo_uuid('sales-demo:org:contractor:20'), 'Claas Jaguar 970', 'Häcksler', 'RMS 970', 'Claas', 'Jaguar 970', 2020, 1430, 'Selbstfahrer', 'Häckseln', 'frei'),
    ('big', 4, fm_demo_uuid('sales-demo:org:contractor:20'), 'MAN Agrar-LKW', 'Transport', 'RMS 480', 'MAN', 'TGS Agrar', 2019, 5200, 'Transport', 'Abfahren', 'frei'),
    ('big', 5, fm_demo_uuid('sales-demo:org:contractor:20'), 'Volvo L90H', 'Radlader', 'RMS L90', 'Volvo', 'L90H', 2018, 6120, 'Lader', 'Hofarbeiten', 'wartung'),
    ('small', 1, fm_demo_uuid('sales-demo:org:contractor:3'), 'Valtra N175', 'Schlepper', 'KAT 175', 'Valtra', 'N175', 2023, 640, 'Zugmaschine', 'Allround', 'frei'),
    ('small', 2, fm_demo_uuid('sales-demo:org:contractor:3'), 'Fendt 516', 'Schlepper', 'KAT 516', 'Fendt', '516 Vario', 2020, 2870, 'Zugmaschine', 'Grünland', 'zugewiesen'),
    ('farmer-pm', 1, fm_demo_uuid('sales-demo:org:farmer:pm-ramsjo'), 'Hofschlepper Ramsjö', 'Schlepper', 'PMR 615', 'Massey Ferguson', '6715S', 2017, 4120, 'Hofmaschine', 'Eigenmechanisierung', 'frei'),
    ('farmer-lindstrom', 1, fm_demo_uuid('sales-demo:org:farmer:lindstrom'), 'Hofschlepper Lindström', 'Schlepper', 'HLD 150', 'New Holland', 'T6.180', 2016, 4880, 'Hofmaschine', 'Eigenmechanisierung', 'frei')
) v(owner_key, row_number, owner_id, name, vehicle_type, license_plate, manufacturer, model, construction_year, operating_hours, resource_type, operation_type, status)
on conflict (id) do update set
  organization_id = excluded.organization_id,
  name = excluded.name,
  vehicle_type = excluded.vehicle_type,
  license_plate = excluded.license_plate,
  manufacturer = excluded.manufacturer,
  model = excluded.model,
  construction_year = excluded.construction_year,
  operating_hours = excluded.operating_hours,
  resource_type = excluded.resource_type,
  operation_type = excluded.operation_type,
  status = excluded.status,
  archived_at = excluded.archived_at,
  updated_at = now();

insert into implements (
  id, organization_id, name, implement_type, manufacturer, working_width,
  resource_type, operation_type, status, archived_at
)
select
  fm_demo_uuid('sales-demo:implement:' || owner_key || ':' || row_number),
  owner_id, name, implement_type, manufacturer, working_width,
  resource_type, operation_type, status::resource_status, null
from (
  values
    ('big', 1, fm_demo_uuid('sales-demo:org:contractor:20'), 'Mähkombination 9 m', 'Mähwerk', 'Krone', 9.00, 'Anbaugerät', 'Mähen', 'frei'),
    ('big', 2, fm_demo_uuid('sales-demo:org:contractor:20'), 'Güllefass 24 m³', 'Gülletechnik', 'Samson', 12.00, 'Anbaugerät', 'Gülle', 'zugewiesen'),
    ('big', 3, fm_demo_uuid('sales-demo:org:contractor:20'), 'Sämaschine 6 m', 'Sätechnik', 'Väderstad', 6.00, 'Anbaugerät', 'Saat', 'frei'),
    ('big', 4, fm_demo_uuid('sales-demo:org:contractor:20'), 'Streuer 4 t', 'Streutechnik', 'Bogballe', 24.00, 'Anbaugerät', 'Kalk/Dünger', 'frei'),
    ('small', 1, fm_demo_uuid('sales-demo:org:contractor:3'), 'Mähwerk 6 m', 'Mähwerk', 'Pöttinger', 6.00, 'Anbaugerät', 'Mähen', 'frei'),
    ('small', 2, fm_demo_uuid('sales-demo:org:contractor:3'), 'Mulcher 2,8 m', 'Mulcher', 'Spearhead', 2.80, 'Anbaugerät', 'Pflege', 'frei')
) i(owner_key, row_number, owner_id, name, implement_type, manufacturer, working_width, resource_type, operation_type, status)
on conflict (id) do update set
  organization_id = excluded.organization_id,
  name = excluded.name,
  implement_type = excluded.implement_type,
  manufacturer = excluded.manufacturer,
  working_width = excluded.working_width,
  resource_type = excluded.resource_type,
  operation_type = excluded.operation_type,
  status = excluded.status,
  archived_at = excluded.archived_at,
  updated_at = now();

insert into task_templates (
  id, organization_id, name, work_steps, time_per_ha, work_mode, progress_type,
  max_vehicles, required_drivers, required_vehicles, required_implements, resource_hint, quantity_unit, archived_at
)
select
  fm_demo_uuid('sales-demo:task:' || owner_key || ':' || row_number),
  owner_id, name, work_steps, time_per_ha, work_mode::work_mode, progress_type::progress_type,
  max_vehicles, required_drivers, required_vehicles, required_implements, resource_hint, quantity_unit, null
from (
  values
    ('big', 1, fm_demo_uuid('sales-demo:org:contractor:20'), 'Mähen', array['Anfahrt','Mähen','Vorgewende prüfen'], 0.28, 'single', 'area', 1, 1, 1, 1, 'Mähkombination', 'ha'),
    ('big', 2, fm_demo_uuid('sales-demo:org:contractor:20'), 'Gülle ausbringen', array['Anfahrt','Ausbringen','Menge dokumentieren'], 0.38, 'team', 'quantity', 2, 1, 1, 1, 'Güllefass mit Schleppschuh', 'm³'),
    ('big', 3, fm_demo_uuid('sales-demo:org:contractor:20'), 'Häckseln', array['Häckseln','Abfahrer koordinieren','Schnittlänge prüfen'], 0.55, 'role_based', 'time', 4, 1, 1, 0, 'Häcksler und Abfahrer', 'h'),
    ('big', 4, fm_demo_uuid('sales-demo:org:contractor:20'), 'Winterdienst', array['Räumen','Streuen','Rapport senden'], 0.00, 'single', 'time', 1, 1, 1, 0, 'Serviceauftrag ohne Fläche', 'h'),
    ('big', 5, fm_demo_uuid('sales-demo:org:contractor:20'), 'Maschinenumsetzung', array['Laden','Transport','Abladen'], 0.00, 'single', 'time', 1, 1, 1, 0, 'Transportauftrag ohne Fläche', 'h'),
    ('small', 1, fm_demo_uuid('sales-demo:org:contractor:3'), 'Mulchen', array['Anfahrt','Mulchen','Randbereiche prüfen'], 0.34, 'single', 'area', 1, 1, 1, 1, 'Mulcher', 'ha'),
    ('small', 2, fm_demo_uuid('sales-demo:org:contractor:3'), 'Zaunkontrolle', array['Kontrolle','Reparatur','Fotodokumentation'], 0.00, 'single', 'time', 1, 1, 1, 0, 'Serviceauftrag ohne Fläche', 'h'),
    ('small', 3, fm_demo_uuid('sales-demo:org:contractor:3'), 'Hoftransport', array['Beladen','Transport','Abladen'], 0.00, 'single', 'trips', 1, 1, 1, 0, 'Transport ohne Flächenbezug', 'Fuhren')
) t(owner_key, row_number, owner_id, name, work_steps, time_per_ha, work_mode, progress_type, max_vehicles, required_drivers, required_vehicles, required_implements, resource_hint, quantity_unit)
on conflict (id) do update set
  organization_id = excluded.organization_id,
  name = excluded.name,
  work_steps = excluded.work_steps,
  time_per_ha = excluded.time_per_ha,
  work_mode = excluded.work_mode,
  progress_type = excluded.progress_type,
  max_vehicles = excluded.max_vehicles,
  required_drivers = excluded.required_drivers,
  required_vehicles = excluded.required_vehicles,
  required_implements = excluded.required_implements,
  resource_hint = excluded.resource_hint,
  quantity_unit = excluded.quantity_unit,
  archived_at = excluded.archived_at,
  updated_at = now();

insert into product_inventory (
  id, organization_id, name, category, unit, supplier_name, article_number, currency,
  purchase_price, sales_price, purchase_price_valid_from, sales_price_valid_from,
  opening_stock, minimum_stock, package_unit, quantity_per_package, notes, archived_at
)
select
  'sales-demo-product-' || owner_key || '-' || row_number,
  owner_id::text, name, category, unit, supplier_name, article_number, currency,
  purchase_price, sales_price, current_date - interval '30 days', current_date - interval '30 days',
  opening_stock, minimum_stock, package_unit, quantity_per_package, notes, null
from (
  values
    ('big', 1, fm_demo_uuid('sales-demo:org:contractor:20'), 'Silofolie 12 x 50', 'Folie', 'Rolle', 'Swedish Agro', 'FOL-1250', 'SEK', 1580.00, 1890.00, 18, 6, 'Rolle', 1, 'Bestandsartikel fuer Silageauftraege'),
    ('big', 2, fm_demo_uuid('sales-demo:org:contractor:20'), 'KAS 27', 'Dünger', 'kg', 'Swedish Agro', 'DUE-027', 'SEK', 4.10, 5.40, 7200, 10000, 'Sack', 25, 'Mindestbestand bewusst unterschritten fuer Demo-Hinweis'),
    ('big', 3, fm_demo_uuid('sales-demo:org:contractor:20'), 'Streusalz', 'Winterdienst', 'kg', 'Swedish Agro', 'SALZ-25', 'SEK', 1.20, 1.95, 1600, 2000, 'Sack', 25, 'Winterdienst'),
    ('small', 1, fm_demo_uuid('sales-demo:org:contractor:3'), 'Diesel Additiv', 'Werkstatt', 'l', 'Hydraulik & Slang AB', 'ADD-10', 'SEK', 48.00, 65.00, 120, 50, 'Kanister', 10, 'Werkstattmaterial'),
    ('small', 2, fm_demo_uuid('sales-demo:org:contractor:3'), 'Zaunlitze', 'Material', 'm', 'Swedish Agro', 'ZAUN-500', 'SEK', 0.85, 1.20, 2200, 500, 'Rolle', 500, 'Material fuer Zaunkontrolle')
) p(owner_key, row_number, owner_id, name, category, unit, supplier_name, article_number, currency, purchase_price, sales_price, opening_stock, minimum_stock, package_unit, quantity_per_package, notes)
on conflict (id) do update set
  organization_id = excluded.organization_id,
  name = excluded.name,
  category = excluded.category,
  unit = excluded.unit,
  supplier_name = excluded.supplier_name,
  article_number = excluded.article_number,
  currency = excluded.currency,
  purchase_price = excluded.purchase_price,
  sales_price = excluded.sales_price,
  opening_stock = excluded.opening_stock,
  minimum_stock = excluded.minimum_stock,
  package_unit = excluded.package_unit,
  quantity_per_package = excluded.quantity_per_package,
  notes = excluded.notes,
  archived_at = excluded.archived_at,
  updated_at = now();

insert into product_movements (
  id, product_id, movement_type, quantity, package_count, package_quantity, booked_at,
  booked_by_name, job_label, currency, purchase_price, note, documents
)
select
  'sales-demo-movement-' || owner_key || '-' || row_number,
  product_id, movement_type, quantity, package_count, package_quantity, current_date - age_days,
  booked_by_name, job_label, currency, purchase_price, note, '[]'::jsonb
from (
  values
    ('big', 1, 'sales-demo-product-big-1', 'in', 18, 18, 1, 20, 'Anna Ramsjö', 'Wareneingang Folie', 'SEK', 1580.00, 'Lieferschein LS-DEMO-1001'),
    ('big', 2, 'sales-demo-product-big-2', 'out', 850, null, null, 3, 'Lisa Berg', 'A-SD-006 Grassilage', 'SEK', null, 'Folie fuer Silage verbraucht'),
    ('big', 3, 'sales-demo-product-big-3', 'out', 400, 16, 25, 2, 'Anna Ramsjö', 'Winterdienst Nybro', 'SEK', null, 'Streusalz im Serviceauftrag'),
    ('small', 1, 'sales-demo-product-small-2', 'out', 300, null, null, 5, 'Tobias Klos', 'Zaunkontrolle Ramsjö', 'SEK', null, 'Zaunmaterial verbucht')
) m(owner_key, row_number, product_id, movement_type, quantity, package_count, package_quantity, age_days, booked_by_name, job_label, currency, purchase_price, note)
on conflict (id) do update set
  product_id = excluded.product_id,
  movement_type = excluded.movement_type,
  quantity = excluded.quantity,
  package_count = excluded.package_count,
  package_quantity = excluded.package_quantity,
  booked_at = excluded.booked_at,
  booked_by_name = excluded.booked_by_name,
  job_label = excluded.job_label,
  currency = excluded.currency,
  purchase_price = excluded.purchase_price,
  note = excluded.note,
  documents = excluded.documents,
  updated_at = now();

insert into fields (
  id, organization_id, name, area_ha, crop, ownership_type, center_lat, center_lng,
  access_lat, access_lng, access_description, notes, archived_at
)
select
  fm_demo_uuid('sales-demo:field:' || owner_key || ':' || row_number),
  owner_id, name, area_ha, crop, ownership_type, lat, lng, lat + 0.002, lng - 0.002,
  access_description, notes, null
from (
  values
    ('pm', 1, fm_demo_uuid('sales-demo:org:farmer:pm-ramsjo'), 'Ramsjö 1A', 8.4, 'Gras', 'owned', 56.8355, 15.9691, 'Zufahrt am Stall vorbei, Tor links.', 'Demo-Flaeche mit guter Zufahrt.'),
    ('pm', 2, fm_demo_uuid('sales-demo:org:farmer:pm-ramsjo'), 'Ramsjö 2B', 5.7, 'Mais', 'lease', 56.8420, 15.9825, 'Schmale Bruecke, nur einzeln fahren.', 'Nasse Senke im Nordosten.'),
    ('pm', 3, fm_demo_uuid('sales-demo:org:farmer:pm-ramsjo'), 'Ramsjö 3C', 12.1, 'Weizen', 'owned', 56.8290, 15.9510, 'Zufahrt von Sueden.', 'Steine am Waldrand.'),
    ('pm', 4, fm_demo_uuid('sales-demo:org:farmer:pm-ramsjo'), 'Ramsjö 4D', 3.9, 'Kleegras', 'lease', 56.8180, 15.9750, 'Kiesweg bis Feldkante.', 'Kleine Flaeche fuer Tablet-Demo.'),
    ('pm', 5, fm_demo_uuid('sales-demo:org:farmer:pm-ramsjo'), 'Ramsjö 5E', 15.3, 'Raps', 'owned', 56.8500, 15.9600, 'Hauptzufahrt West.', 'Grosse Flaeche fuer Teammodus.'),
    ('pm', 6, fm_demo_uuid('sales-demo:org:farmer:pm-ramsjo'), 'Ramsjö 6F', 7.8, 'Gerste', 'owned', 56.8450, 15.9400, 'Zufahrt Nord.', 'Problemstelle Drainage.'),
    ('pm', 7, fm_demo_uuid('sales-demo:org:farmer:pm-ramsjo'), 'Ramsjö 7G', 9.6, 'Gras', 'lease', 56.8100, 15.9550, 'Alte Hofzufahrt nutzen.', 'Pachtflaeche.'),
    ('pm', 8, fm_demo_uuid('sales-demo:org:farmer:pm-ramsjo'), 'Ramsjö 8H', 4.2, 'Hafer', 'owned', 56.8220, 15.9900, 'Zufahrt ueber Waldweg.', 'Enge Einfahrt.'),
    ('lindstrom', 1, fm_demo_uuid('sales-demo:org:farmer:lindstrom'), 'Lindström Nord', 6.2, 'Gras', 'owned', 56.9300, 15.4300, 'Zufahrt an der Scheune.', 'Gruenland.'),
    ('lindstrom', 2, fm_demo_uuid('sales-demo:org:farmer:lindstrom'), 'Lindström Süd', 10.8, 'Mais', 'lease', 56.9180, 15.4450, 'Zufahrt von Landstrasse.', 'Haeckselauftrag.'),
    ('lindstrom', 3, fm_demo_uuid('sales-demo:org:farmer:lindstrom'), 'Lindström Moor', 4.9, 'Gras', 'lease', 56.9100, 15.4200, 'Nur bei trockenem Wetter.', 'Nassstelle.'),
    ('lindstrom', 4, fm_demo_uuid('sales-demo:org:farmer:lindstrom'), 'Lindström Acker', 13.7, 'Weizen', 'owned', 56.9400, 15.4550, 'Breite Zufahrt Ost.', 'Saatauftrag.'),
    ('lindstrom', 5, fm_demo_uuid('sales-demo:org:farmer:lindstrom'), 'Lindström Wiese', 2.8, 'Kleegras', 'owned', 56.9250, 15.4650, 'Zufahrt am Teich.', 'Kleine Wiese.')
) f(owner_key, row_number, owner_id, name, area_ha, crop, ownership_type, lat, lng, access_description, notes)
on conflict (id) do update set
  organization_id = excluded.organization_id,
  name = excluded.name,
  area_ha = excluded.area_ha,
  crop = excluded.crop,
  ownership_type = excluded.ownership_type,
  center_lat = excluded.center_lat,
  center_lng = excluded.center_lng,
  access_lat = excluded.access_lat,
  access_lng = excluded.access_lng,
  access_description = excluded.access_description,
  notes = excluded.notes,
  archived_at = excluded.archived_at,
  updated_at = now();

delete from field_boundaries
where field_id in (
  select fm_demo_uuid('sales-demo:field:' || owner_key || ':' || row_number)
  from (
    values
      ('pm',1),('pm',2),('pm',3),('pm',4),('pm',5),('pm',6),('pm',7),('pm',8),
      ('lindstrom',1),('lindstrom',2),('lindstrom',3),('lindstrom',4),('lindstrom',5)
  ) f(owner_key, row_number)
);

insert into field_boundaries (field_id, points_json)
select
  id,
  jsonb_build_array(
    jsonb_build_object('lat', center_lat - 0.004, 'lng', center_lng - 0.006),
    jsonb_build_object('lat', center_lat - 0.003, 'lng', center_lng + 0.006),
    jsonb_build_object('lat', center_lat + 0.004, 'lng', center_lng + 0.005),
    jsonb_build_object('lat', center_lat + 0.005, 'lng', center_lng - 0.004)
  )
from fields
where id in (
  select fm_demo_uuid('sales-demo:field:' || owner_key || ':' || row_number)
  from (
    values
      ('pm',1),('pm',2),('pm',3),('pm',4),('pm',5),('pm',6),('pm',7),('pm',8),
      ('lindstrom',1),('lindstrom',2),('lindstrom',3),('lindstrom',4),('lindstrom',5)
  ) f(owner_key, row_number)
);

insert into field_hazards (id, field_id, hazard_type, title, description, lat, lng)
select
  fm_demo_uuid('sales-demo:hazard:' || owner_key || ':' || row_number),
  fm_demo_uuid('sales-demo:field:' || owner_key || ':' || field_number),
  hazard_type::hazard_type,
  title,
  description,
  lat,
  lng
from (
  values
    ('pm', 1, 2, 'wet_area', 'Nasse Senke', 'Bei Regen meiden, Fahrer informieren.', 56.8440, 15.9840),
    ('pm', 2, 3, 'stones', 'Steinriegel', 'Steine am Waldrand links.', 56.8310, 15.9530),
    ('lindstrom', 1, 3, 'wet_area', 'Mooriger Bereich', 'Nur mit leichten Maschinen befahren.', 56.9120, 15.4220)
) h(owner_key, row_number, field_number, hazard_type, title, description, lat, lng)
on conflict (id) do update set
  field_id = excluded.field_id,
  hazard_type = excluded.hazard_type,
  title = excluded.title,
  description = excluded.description,
  lat = excluded.lat,
  lng = excluded.lng;

insert into field_shares (
  id, field_id, shared_by_organization_id, shared_with_organization_id, permission, status, created_at, revoked_at
)
select
  fm_demo_uuid('sales-demo:field-share:' || field_id::text || ':' || contractor_id::text),
  field_id,
  farmer_id,
  contractor_id,
  'use_in_jobs'::field_share_permission,
  'active'::field_share_status,
  now() - interval '10 days',
  null
from (
  select id as field_id, organization_id as farmer_id
  from fields
  where organization_id in (fm_demo_uuid('sales-demo:org:farmer:pm-ramsjo'), fm_demo_uuid('sales-demo:org:farmer:lindstrom'))
) demo_fields
cross join (
  values
    (fm_demo_uuid('sales-demo:org:contractor:20')),
    (fm_demo_uuid('sales-demo:org:contractor:3'))
) contractors(contractor_id)
on conflict (field_id, shared_with_organization_id) do update set
  shared_by_organization_id = excluded.shared_by_organization_id,
  permission = excluded.permission,
  status = excluded.status,
  revoked_at = excluded.revoked_at;

insert into jobs (
  id, job_number, farmer_organization_id, contractor_organization_id, title, description,
  planned_start, planned_end, priority, status, archived_at
)
select
  fm_demo_uuid('sales-demo:job:' || job_key),
  job_number,
  farmer_id,
  contractor_id,
  title,
  description,
  planned_start,
  planned_end,
  priority::job_priority,
  status::job_status,
  null
from (
  values
    ('pm-grassilage', 'SD-001', fm_demo_uuid('sales-demo:org:farmer:pm-ramsjo'), fm_demo_uuid('sales-demo:org:contractor:20'), 'Grassilage erster Schnitt', 'Feldauftrag: mehrere Flaechen, mehrere Aufgaben, Teammodus.', now() + interval '1 day', now() + interval '1 day 8 hours', 'high', 'scheduled'),
    ('pm-guelle', 'SD-002', fm_demo_uuid('sales-demo:org:farmer:pm-ramsjo'), fm_demo_uuid('sales-demo:org:contractor:20'), 'Gülle ausbringen Ramsjö 5E', 'Feldauftrag mit Mengenfortschritt und zwei Kolonnen.', now() + interval '2 days', now() + interval '2 days 6 hours', 'normal', 'open'),
    ('pm-winterdienst', 'SD-003', fm_demo_uuid('sales-demo:org:farmer:pm-ramsjo'), fm_demo_uuid('sales-demo:org:contractor:20'), 'Winterdienst Hofzufahrt', 'Allgemeiner Kundenauftrag ohne Flaechenbezug.', now() + interval '3 days', now() + interval '3 days 3 hours', 'urgent', 'open'),
    ('pm-maschinenumsetzung', 'SD-004', fm_demo_uuid('sales-demo:org:farmer:pm-ramsjo'), fm_demo_uuid('sales-demo:org:contractor:20'), 'Maschinenumsetzung nach Kalmar', 'Transportauftrag ohne Feldbearbeitung.', now() - interval '1 day', now() - interval '1 day 5 hours', 'normal', 'completed'),
    ('lindstrom-haeckseln', 'SD-005', fm_demo_uuid('sales-demo:org:farmer:lindstrom'), fm_demo_uuid('sales-demo:org:contractor:20'), 'Mais häckseln Lindström Süd', 'Rollenmodus mit Häcksler und Abfahrern.', now() + interval '4 days', now() + interval '4 days 9 hours', 'high', 'open'),
    ('lindstrom-problem', 'SD-006', fm_demo_uuid('sales-demo:org:farmer:lindstrom'), fm_demo_uuid('sales-demo:org:contractor:20'), 'Kalk streuen Moorfläche', 'Demoauftrag mit Problem/Klärung.', now() - interval '2 days', now() - interval '2 days 4 hours', 'normal', 'problem'),
    ('pm-mulchen-small', 'SD-101', fm_demo_uuid('sales-demo:org:farmer:pm-ramsjo'), fm_demo_uuid('sales-demo:org:contractor:3'), 'Mulchen Wegrand Ramsjö', 'Kleiner Feldauftrag beim zweiten Lohnunternehmer.', now() + interval '5 days', now() + interval '5 days 4 hours', 'normal', 'open'),
    ('pm-zaun-small', 'SD-102', fm_demo_uuid('sales-demo:org:farmer:pm-ramsjo'), fm_demo_uuid('sales-demo:org:contractor:3'), 'Zaunkontrolle Jungviehweide', 'Allgemeiner Kundenauftrag ohne Flaeche.', now() + interval '6 days', now() + interval '6 days 2 hours', 'normal', 'scheduled'),
    ('lindstrom-transport-small', 'SD-103', fm_demo_uuid('sales-demo:org:farmer:lindstrom'), fm_demo_uuid('sales-demo:org:contractor:3'), 'Hoftransport Ballen', 'Transport ohne Feldbearbeitung, nach Fuhren.', now() - interval '3 days', now() - interval '3 days 4 hours', 'low', 'completed')
) j(job_key, job_number, farmer_id, contractor_id, title, description, planned_start, planned_end, priority, status)
on conflict (id) do update set
  job_number = excluded.job_number,
  farmer_organization_id = excluded.farmer_organization_id,
  contractor_organization_id = excluded.contractor_organization_id,
  title = excluded.title,
  description = excluded.description,
  planned_start = excluded.planned_start,
  planned_end = excluded.planned_end,
  priority = excluded.priority,
  status = excluded.status,
  archived_at = excluded.archived_at,
  updated_at = now();

delete from job_fields
where job_id in (
  select fm_demo_uuid('sales-demo:job:' || job_key)
  from (
    values
      ('pm-grassilage'),('pm-guelle'),('pm-winterdienst'),('pm-maschinenumsetzung'),('lindstrom-haeckseln'),('lindstrom-problem'),('pm-mulchen-small'),('pm-zaun-small'),('lindstrom-transport-small')
  ) jobs(job_key)
);

insert into job_fields (job_id, field_id, notes, access_notes)
select
  fm_demo_uuid('sales-demo:job:' || job_key),
  fm_demo_uuid('sales-demo:field:' || owner_key || ':' || field_number),
  notes,
  access_notes
from (
  values
    ('pm-grassilage', 'pm', 1, 'Mähen und Schwaden', 'Zufahrt am Stall'),
    ('pm-grassilage', 'pm', 4, 'Kleine Kleegrasfläche', 'Kiesweg'),
    ('pm-grassilage', 'pm', 7, 'Pachtfläche', 'Alte Hofzufahrt'),
    ('pm-guelle', 'pm', 5, 'Güllemenge planen', 'Hauptzufahrt West'),
    ('lindstrom-haeckseln', 'lindstrom', 2, 'Maisfläche', 'Landstraße'),
    ('lindstrom-problem', 'lindstrom', 3, 'Problemfläche', 'Nur trocken'),
    ('pm-mulchen-small', 'pm', 8, 'Wegrand mulchen', 'Waldweg')
) jf(job_key, owner_key, field_number, notes, access_notes)
on conflict (job_id, field_id) do update set
  notes = excluded.notes,
  access_notes = excluded.access_notes;

insert into job_tasks (
  id, job_id, field_id, task_type, title, description, work_mode, progress_type,
  target_area_ha, target_quantity, quantity_unit, target_trips, max_active_workers, status
)
select
  fm_demo_uuid('sales-demo:job-task:' || task_key),
  fm_demo_uuid('sales-demo:job:' || job_key),
  case when owner_key is null then null else fm_demo_uuid('sales-demo:field:' || owner_key || ':' || field_number) end,
  task_type,
  title,
  description,
  work_mode::work_mode,
  progress_type::progress_type,
  target_area_ha,
  target_quantity,
  quantity_unit,
  target_trips,
  max_active_workers,
  status::task_status
from (
  values
    ('pm-grassilage-m-1', 'pm-grassilage', 'pm', 1, 'mowing', 'Mähen', 'Mähkombination 9 m', 'single', 'area', 8.4, null, 'ha', null, 1, 'reserved'),
    ('pm-grassilage-m-4', 'pm-grassilage', 'pm', 4, 'mowing', 'Mähen', 'Mähkombination 9 m', 'single', 'area', 3.9, null, 'ha', null, 1, 'open'),
    ('pm-grassilage-s-1', 'pm-grassilage', 'pm', 1, 'swathing', 'Schwaden', 'Nach dem Mähen', 'single', 'area', 8.4, null, 'ha', null, 1, 'open'),
    ('pm-grassilage-h-7', 'pm-grassilage', 'pm', 7, 'harvest', 'Häckseln', 'Häcksler plus Abfahrer', 'role_based', 'time', null, null, 'h', null, 4, 'open'),
    ('pm-guelle-5', 'pm-guelle', 'pm', 5, 'slurry', 'Gülle ausbringen', 'Zwei Kolonnen möglich', 'team', 'quantity', null, 420, 'm³', null, 2, 'open'),
    ('pm-winterdienst', 'pm-winterdienst', null, null, 'winter_service', 'Winterdienst', 'Hofzufahrt räumen und streuen', 'single', 'time', null, null, 'h', null, 1, 'open'),
    ('pm-maschinenumsetzung', 'pm-maschinenumsetzung', null, null, 'transport', 'Maschinenumsetzung', 'Transport nach Kalmar', 'single', 'time', null, null, 'h', null, 1, 'completed'),
    ('lindstrom-haeckseln-2', 'lindstrom-haeckseln', 'lindstrom', 2, 'harvest', 'Mais häckseln', 'Rollenmodus mit Abfahrern', 'role_based', 'time', null, null, 'h', null, 4, 'open'),
    ('lindstrom-problem-3', 'lindstrom-problem', 'lindstrom', 3, 'lime', 'Kalk streuen', 'Feuchte Fläche prüfen', 'team', 'quantity', null, 12, 't', null, 2, 'problem'),
    ('pm-mulchen-small-8', 'pm-mulchen-small', 'pm', 8, 'mulching', 'Mulchen', 'Wegrand und Zufahrt', 'single', 'area', 4.2, null, 'ha', null, 1, 'open'),
    ('pm-zaun-small', 'pm-zaun-small', null, null, 'fence_check', 'Zaunkontrolle', 'Zaun reparieren und dokumentieren', 'single', 'time', null, null, 'h', null, 1, 'reserved'),
    ('lindstrom-transport-small', 'lindstrom-transport-small', null, null, 'farm_transport', 'Hoftransport Ballen', 'Ballen zwischenlagern', 'single', 'trips', null, null, 'Fuhren', 12, 1, 'completed')
) jt(task_key, job_key, owner_key, field_number, task_type, title, description, work_mode, progress_type, target_area_ha, target_quantity, quantity_unit, target_trips, max_active_workers, status)
on conflict (id) do update set
  job_id = excluded.job_id,
  field_id = excluded.field_id,
  task_type = excluded.task_type,
  title = excluded.title,
  description = excluded.description,
  work_mode = excluded.work_mode,
  progress_type = excluded.progress_type,
  target_area_ha = excluded.target_area_ha,
  target_quantity = excluded.target_quantity,
  quantity_unit = excluded.quantity_unit,
  target_trips = excluded.target_trips,
  max_active_workers = excluded.max_active_workers,
  status = excluded.status,
  updated_at = now();

insert into task_assignments (
  id, job_task_id, personnel_resource_id, vehicle_name, status, started_at, completed_at,
  completed_area_ha, completed_quantity, completed_trips, notes
)
select
  fm_demo_uuid('sales-demo:assignment:' || assignment_key),
  fm_demo_uuid('sales-demo:job-task:' || task_key),
  fm_demo_uuid('sales-demo:personnel:' || personnel_key),
  vehicle_name,
  status::assignment_status,
  started_at,
  completed_at,
  completed_area_ha,
  completed_quantity,
  completed_trips,
  notes
from (
  values
    ('a1', 'pm-grassilage-m-1', 'big:3', 'John Deere 6250R', 'reserved', null::timestamptz, null::timestamptz, null::numeric, null::numeric, null::integer, 'Für morgen eingeplant.'),
    ('a2', 'pm-maschinenumsetzung', 'big:5', 'MAN Agrar-LKW', 'completed', now() - interval '1 day 5 hours', now() - interval '1 day 2 hours', null::numeric, null::numeric, null::integer, 'Transport abgeschlossen.'),
    ('a3', 'lindstrom-transport-small', 'small:2', 'Fendt 516', 'completed', now() - interval '3 days 4 hours', now() - interval '3 days 1 hour', null::numeric, null::numeric, 12, '12 Fuhren erledigt.'),
    ('a4', 'pm-zaun-small', 'small:2', 'Fendt 516', 'reserved', null::timestamptz, null::timestamptz, null::numeric, null::numeric, null::integer, 'Material Zaunlitze mitnehmen.')
) a(assignment_key, task_key, personnel_key, vehicle_name, status, started_at, completed_at, completed_area_ha, completed_quantity, completed_trips, notes)
on conflict (id) do update set
  job_task_id = excluded.job_task_id,
  personnel_resource_id = excluded.personnel_resource_id,
  vehicle_name = excluded.vehicle_name,
  status = excluded.status,
  started_at = excluded.started_at,
  completed_at = excluded.completed_at,
  completed_area_ha = excluded.completed_area_ha,
  completed_quantity = excluded.completed_quantity,
  completed_trips = excluded.completed_trips,
  notes = excluded.notes,
  updated_at = now();

insert into task_reports (id, job_task_id, report_type, message, area_ha, quantity, trips, created_at)
select
  fm_demo_uuid('sales-demo:report:' || report_key),
  fm_demo_uuid('sales-demo:job-task:' || task_key),
  report_type::report_type,
  message,
  area_ha,
  quantity,
  trips,
  created_at
from (
  values
    ('r1', 'lindstrom-problem-3', 'issue', 'Flaeche ist zu nass, Freigabe durch Dispo erforderlich.', null::numeric, null::numeric, null::integer, now() - interval '2 days 3 hours'),
    ('r2', 'pm-maschinenumsetzung', 'completion', 'Maschine abgestellt, Kunde informiert.', null::numeric, null::numeric, null::integer, now() - interval '1 day 2 hours'),
    ('r3', 'lindstrom-transport-small', 'completion', 'Ballenlager voll, alle Fuhren dokumentiert.', null::numeric, null::numeric, 12, now() - interval '3 days 1 hour')
) r(report_key, task_key, report_type, message, area_ha, quantity, trips, created_at)
on conflict (id) do update set
  job_task_id = excluded.job_task_id,
  report_type = excluded.report_type,
  message = excluded.message,
  area_ha = excluded.area_ha,
  quantity = excluded.quantity,
  trips = excluded.trips,
  created_at = excluded.created_at;

select
  'Vertriebsdemo angelegt' as status,
  (select count(*) from organizations where id in (
    fm_demo_uuid('sales-demo:org:contractor:20'),
    fm_demo_uuid('sales-demo:org:contractor:3'),
    fm_demo_uuid('sales-demo:org:farmer:pm-ramsjo'),
    fm_demo_uuid('sales-demo:org:farmer:lindstrom')
  )) as demo_betriebe,
  (select count(*) from external_contacts where organization_id = fm_demo_uuid('sales-demo:org:contractor:20') and contact_kind = 'customer' and active) as kunden_grosser_lohnunternehmer,
  (select count(*) from external_contacts where organization_id = fm_demo_uuid('sales-demo:org:contractor:3') and contact_kind = 'customer' and active) as kunden_kleiner_lohnunternehmer,
  (select count(*) from jobs where id in (
    select fm_demo_uuid('sales-demo:job:' || job_key)
    from (
      values
        ('pm-grassilage'),('pm-guelle'),('pm-winterdienst'),('pm-maschinenumsetzung'),('lindstrom-haeckseln'),('lindstrom-problem'),('pm-mulchen-small'),('pm-zaun-small'),('lindstrom-transport-small')
    ) jobs(job_key)
  )) as demo_auftraege;
