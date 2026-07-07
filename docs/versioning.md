# Versionierung und Deployment-Prüfung

Die sichtbare Version wird in `src/lib/appVersion.ts` gepflegt.

Vor jedem Release:
1. `APP_VERSION` erhöhen, z. B. von `0.2.1` auf `0.2.2`.
2. `APP_BUILD` mit Datum und Uhrzeit aktualisieren, z. B. `2026-07-07.1930`.
3. Den gleichen Kennwert in `public/sw.js` bei `CACHE_VERSION` aktualisieren.
4. Committen und zu GitHub pushen.
5. Nach dem Vercel-Deployment die Versionsanzeige unten links in Farm-Manager prüfen.

So lässt sich sofort erkennen, ob der Browser die aktuelle PWA-Version geladen hat.
