# Farm-Manager Mandanten- und Zusammenarbeitstest

## Analyse Stand

- `organizations`, `fields`, `jobs`, `personnel_resources`, `vehicles`, `implements` und `task_templates` besitzen bereits Organisationsbezüge.
- `organization_relationships`, `field_shares`, `external_contacts` und explizite `organization_memberships` werden durch `supabase/add-multi-tenant-collaboration.sql` ergänzt.
- In der produktiven Supabase-Ansicht werden Demo-Organisationen nicht mehr zusätzlich in die Organisationsliste gemischt.
- Die Stammdaten-UI zeigt jetzt den Kontext `Stammdaten von: [Organisation]` und führt Zusammenarbeit als eigenen Bereich.

## Akzeptanztests

1. Landwirt A anmelden und prüfen, dass nur eigene Flächen, eigene Aufträge und eigene Stammdaten sichtbar sind.
2. Landwirt A prüft Stammdaten > Zusammenarbeit: Lohnunternehmer X erscheint nur bei aktiver Beziehung oder bestehendem Auftragskontext.
3. Lohnunternehmer X anmelden und prüfen, dass nur eigene Ressourcen und verbundene Landwirte/Kunden sichtbar sind.
4. Lohnunternehmer X öffnet Flächen: Fremdflächen erscheinen nur bei aktivem Auftrag oder aktiver `field_shares`-Freigabe.
5. Lohnunternehmer X bearbeitet Maschinen/Fahrer: möglich für eigene Organisation, nicht für Landwirt A.
6. Landwirt A bearbeitet Firmenstammdaten: möglich für eigene Organisation, nicht für Lohnunternehmer X.
7. Relationship auf `ended` setzen: alte Aufträge bleiben sichtbar, neue Aufträge dürfen fachlich nicht mehr ohne erneute Aktivierung erstellt werden.
8. Relationship auf `blocked` setzen: keine neue Zusammenarbeit und keine neue Flächenfreigabe an diesen Partner.

## Supabase-Prüfung

- Migration `supabase/add-multi-tenant-collaboration.sql` in Supabase ausführen.
- Danach RLS mit echten Logins prüfen, nicht nur im Demo-/Support-Admin-Kontext.
- Bestehende offene Phase: UI für aktive Einladung/Annahme von Relationships kann später komfortabler ausgebaut werden.
