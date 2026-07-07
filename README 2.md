# Farm-Manager Prototyp

## Lokal starten

```bash
npm install
npm run dev -- --port 3001
```

Ohne Supabase-Zugangsdaten läuft die App automatisch im Demo-Modus mit lokalen Beispieldaten.

## Supabase einrichten

1. Bei [Supabase](https://supabase.com) ein neues Projekt erstellen.
2. In Supabase unter `Project Settings > API` die Werte kopieren:
   - `Project URL`
   - `anon public key`
3. Lokal eine `.env.local` anlegen:

```bash
VITE_SUPABASE_URL=deine-project-url
VITE_SUPABASE_ANON_KEY=dein-anon-key
```

Wichtig: Niemals den Service-Role-Key im Frontend verwenden. `.env.local` ist in `.gitignore` ausgeschlossen.

## Datenbankschema ausführen

Die Datei [supabase/schema.sql](/Users/berndklos/Documents/Farmmanger/supabase/schema.sql) im Supabase SQL Editor ausführen.

Sie erstellt:
- Organisationen, Profile, Flächen, Feldgrenzen und Problemstellen
- Aufträge, Teilaufträge, Zuweisungen und Rückmeldungen
- Dokumenttabellen
- RLS-Policies
- Storage-Buckets
- die Funktion `claim_job_task(...)` für atomare Fahrer-Anmeldung

## Storage-Buckets

Das Schema legt diese Buckets an:
- `field-photos`
- `job-documents`
- `task-reports`

Die App speichert aktuell noch keine echten Dateien hoch, ist aber tabellenseitig darauf vorbereitet.

## Ersten Benutzer anlegen

1. In Supabase Authentication einen Benutzer erstellen oder per App registrieren.
2. In `organizations` eine Organisation anlegen.
3. In `profiles` einen Eintrag mit derselben `id` wie `auth.users.id` erstellen.
4. Rolle setzen, z. B. `farmer_admin`, `contractor_admin` oder `driver`.
5. `organization_id` auf die passende Organisation setzen.

## Demo-Modus vs. Supabase

- Ohne `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY`: Demo-Modus aktiv.
- Mit gültigen Variablen: Die App versucht Supabase-Tabellen zu laden.
- Wenn Supabase nicht erreichbar ist oder Policies blockieren, fällt die App auf Demo-Daten zurück und zeigt einen Hinweis.

## Vor Produktivstart prüfen

- RLS-Policies mit echten Testbenutzern je Rolle prüfen.
- Advisor-Freigaben fachlich finalisieren.
- Storage-Pfade pro Organisation absichern.
- Auth-Flows, Einladungen und Passwort-Reset bauen.
- Serverseitige Validierung für Auftragsstatus und Abschlussberichte ergänzen.
- Migrationen versionieren und Seed-Daten getrennt verwalten.

## Phase-1-Stand

Umgesetzt:
- Flächenverwaltung mit Karten, Feldgrenzen, Zufahrtspunkt, Navigation und Problemstellen.
- Feldgrenzen können im Frontend-Mockup eingezeichnet werden.
- Auftragserstellung mit mehreren Flächen, mehreren Aufgaben, Priorität, Fortschrittsart und Arbeitsmodus.
- Teilaufträge zeigen Zielwerte, aktive Fahrer/Fahrzeuge und einfache Überziel-Warnungen.
- Fahreransicht ist mobile-first mit Navigation, Problemstellenmeldung, Start, Pause, Teilabschluss und Abschluss.
- Einsatzleiteransicht kann Fahrer zuweisen, entfernen, Teilaufträge freigeben und Probleme sehen.
- Supabase-Client, SQL-Schema, RLS-Grundlagen, Storage-Buckets und Demo-Fallback sind vorbereitet.
- PWA-Basis mit Manifest, Theme-Farbe und minimalem Service Worker ist vorbereitet.

Bewusst noch nicht Teil von Phase 1:
- Abrechnung, Buchhaltung, SMS, WhatsApp und native App.
- Vollständige Offline-Synchronisierung.
- Produktive Auth-Oberfläche mit Einladungen und Rollenverwaltung.
