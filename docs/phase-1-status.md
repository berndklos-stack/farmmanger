# Phase 1 Status

Stand: 2026-07-07

## Vollständig oder weitgehend mit Supabase verbunden

- Anmeldung ueber Supabase Auth fuer produktive Profile, inklusive `profiles` mit Rollen, Modulen und Menuepunkten.
- Support-Admin-Rechteverwaltung fuer Rollen, Betriebszuordnung, Module und Menuepunkte.
- Benutzeranlage ueber Edge Function `sync-user-auth` mit Service-Role, nicht direkt aus dem Browser.
- Fahreranlage aus Personal-Stammdaten ueber Edge Function `sync-driver-auth`.
- Stammdaten fuer Betriebe, Fahrer/Personal, Fahrzeuge, Geraete, Aufgabenvorlagen und Auftragsarten.
- Auftragserstellung mit `jobs`, `job_fields` und `job_tasks`.
- Dispo-Zuordnung ueber `task_assignments`.
- Atomare Fahrer-Anmeldung ueber RPC `claim_job_task` fuer single/team/max_active_workers.
- Fahrer-Rueckmeldungen und Statusprotokoll ueber `task_reports`.
- Fahrer-Live-Standorte ueber `driver_locations`.
- Storage-Buckets fuer Feldfotos, Job-Dokumente und Task-Reports sind privat angelegt.

## Noch Demo-Logik oder unvollstaendige Persistenz

- Offline-Puffer nutzt LocalStorage und synchronisiert Teilauftraege erneut, hat aber noch keine serverseitige Konflikt-Tabelle.
- Dispo-Overrides und lokale Notfallkopien werden in LocalStorage gehalten, damit die App offline bedienbar bleibt.
- Flaechenhistorie wird aus abgeschlossenen Teilauftraegen/Reports berechnet, aber noch nicht in einer dedizierten History-Tabelle materialisiert.
- Abschlussbericht ist in der App vorhanden und aggregiert Ist-Werte, aber noch kein revisionssicheres PDF/Archiv.
- Foto- und Dokumentvorschauen nutzen signierte URLs; bestehende Alt-Datensaetze koennen noch alte Public-URLs enthalten.
- Testhilfe ist als interne Checkliste eingebaut, erzeugt aber bewusst keine neuen Produktiv-Testdaten automatisch.

## Kritische Nutzerablaeufe

- Fahrer-Claim muss immer ueber `claim_job_task` laufen; lokale Uebernahme nach RPC-Fehler ist unzulaessig.
- `single` darf nur eine aktive Zuordnung haben; `team` darf `max_active_workers` nicht ueberschreiten.
- Dieselbe Person darf nicht parallel mehrfach demselben Teilauftrag zugeordnet werden.
- Team-Leistungen muessen aus allen Fahrer-Zuordnungen summiert werden.
- Teilweise erledigte Flaechen/Mengen duerfen Restwerte nicht verlieren.
- Storage darf private Dateien nicht ueber Public-Bucket-URLs ausliefern.
- Offline-Sync darf Konflikte nicht still ueberschreiben; aktuell werden fehlgeschlagene Syncs sichtbar im Pending-Puffer gehalten.
