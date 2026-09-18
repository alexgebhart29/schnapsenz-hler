# Schnapsen Zähler

Eine App zum Zählen von **Bummerl** und **Punkten** beim Schnapsen – für **Zweier** (1 gegen 1)
und **Vierer** (2 gegen 2 in festen Teams). Umgesetzt als **React-PWA**: läuft im Browser und
lässt sich am iPhone über Safari → Teilen → „Zum Home-Bildschirm“ wie eine App installieren.

Dazu gibt es einen kleinen **Server mit SQLite**, damit alle Geräte denselben Stand sehen.
Ohne Server läuft die App weiterhin rein lokal.

Spezifikation: [`schnapsen-zaehler-app.md`](schnapsen-zaehler-app.md) ·
Betrieb auf Proxmox: [`DEPLOY.md`](DEPLOY.md)

## Zählweise

Klassisches Schnapsen: Wer eine Partie gewinnt, **zieht sich selbst** Punkte ab:

| Abzug | wenn der Gegner … |
| ----- | ----------------- |
| −1    | 33 Augen oder mehr hat |
| −2    | 1 bis 32 Augen hat |
| −3    | keinen Stich gemacht hat (schwarz) |

Im **Zweier** starten beide Spieler bei **7** (einstellbar 5–40). Im **Vierer** zählt jedes Team
traditionell von **24** herab (ebenfalls einstellbar) – dort kommen je nach Spielausgang auch
höhere Abzüge vor, deshalb gibt es dort zusätzlich zu den drei Buttons ein Eingabefeld für eine
**frei wählbare Punktzahl**.

Wer zuerst bei **0** ist, gewinnt das Bummerl. Danach kann direkt ein neues Bummerl mit denselben
Spielern gestartet werden; die App zählt die gewonnenen Bummerl mit. Zweier und Vierer haben dabei
**getrennte Startwert-Einstellungen** (Einstellungen → Zähler).

## Rangliste (Stufen)

Ranks sind **Stufen mit einer Punkteschwelle**, z. B. „Gold 1“ ab 5 Punkten. Als Punktzahl zählt
die **Summe der gewonnenen Bummerl**. Jede Partei trägt automatisch die höchste Stufe, deren
Schwelle sie erreicht hat; die Rangliste zeigt zusätzlich, wie viele Punkte bis zur nächsten Stufe
fehlen und wer gerade auf welcher Stufe steht.

**Zweier und Vierer haben getrennte Stufen und getrennte Ranglisten.** Im Zweier zählt jeder
Spieler für sich, im Vierer das Team als Einheit („Anna & Bert“ – unabhängig davon, in welcher
Reihenfolge die Namen eingegeben wurden). Die Stufen werden von Hand gepflegt; vorgegeben ist
nichts, beide Listen starten leer.

## Funktionen

- **Zweier und Vierer**: beim Spielstart umschaltbar, im Vierer mit vier Namen und zwei Teams
- **Spiel-Screen** mit großen Zählern, Bummerl-Stand, Abzugs-Buttons und Undo (bis 50 Schritte,
  auch über Bummerl- und Spielende hinweg)
- **Automatische Bummerl-Erkennung** bei 0 plus manuelles „Bummerl beenden“
- **Beendete Spiele lassen sich jederzeit weiterspielen** – im Spiel-Screen oder aus der Historie;
  Bummerl-Stand und Verlauf bleiben erhalten
- **Spielernamen** werden gemerkt und beim nächsten Spiel als Vorschläge angeboten
- **Historie** aller Spiele mit Datum, Bummerl-Verlauf und Endstand
- **Statistik** je Spieler bzw. Team: Spiele, gewonnene Spiele, Bummerl +/−, Siegquote,
  häufigster Gegner
- **Mehrgeräte-Abgleich** über den eigenen Server, mit Anmeldung und Benutzerverwaltung
- Offline-fähig, dunkles und helles Design, iOS-Safe-Areas berücksichtigt

## Anmeldung und Abgleich

Die App erkennt beim Start selbst, ob ein Server vorhanden ist:

| Lage | Verhalten |
| ---- | --------- |
| Kein Server (z. B. `npm run dev` ohne Backend) | reiner Gerätebetrieb, keine Anmeldung |
| Server da, nicht angemeldet | Anmeldebildschirm, „Ohne Anmeldung weiterspielen“ möglich |
| Angemeldet | Abgleich bei jeder Änderung, beim Öffnen und alle 60 Sekunden |

**Offline-first:** Gezählt wird immer lokal, auch ohne Netz. Sobald der Server wieder erreichbar
ist, gleicht die App ab. Bei Konflikten gewinnt die **jüngere Änderung**; Löschungen reisen als
Grabstein mit, damit sie auch andere Geräte erreichen. Als Wasserzeichen dient eine Sequenznummer
des Servers – falsch gehende Geräteuhren können den Abgleich damit nicht durcheinanderbringen.

Der erste Administrator wird beim allerersten Start angelegt (siehe `.env.example`). Er kann in
der App unter **Einstellungen → Konto → Benutzer verwalten** weitere Konten anlegen, Passwörter
zurücksetzen und Konten löschen. **Alle Benutzer teilen sich denselben Datenbestand** – der Login
schützt den Zugang, trennt aber keine Daten.

Was **nicht** synchronisiert wird: das Theme und das gerade offene Spiel (beides gehört zum Gerät).

## Entwicklung

```bash
npm install                 # App
npm --prefix server install # Server

npm run dev        # App auf http://localhost:5173 (ohne Backend: reiner Gerätebetrieb)
npm test           # Tests der App (67)
npm run build      # Typecheck + Produktions-Build nach dist/
npm run icons      # PWA-Icons in public/ neu erzeugen

npm --prefix server run dev    # API auf http://localhost:8080
npm --prefix server test       # Server-Tests (25)
```

Für App **und** Server zusammen: `npm run build` und danach `npm --prefix server run dev` mit
`STATIC_DIR=../dist` – oder einfach das Docker-Image bauen.

## Docker

```bash
cp .env.example .env    # anpassen, mindestens ADMIN_PASSWORD
docker compose up -d --build
docker compose logs -f  # beim ersten Start steht hier das Admin-Passwort
```

Danach läuft alles auf `http://<host>:8080` – App und API unter derselben Adresse, also kein CORS
und keine getrennte Domain nötig.

Das Image ist dreistufig gebaut: Node baut die PWA, Node baut den Server, im Laufzeit-Image bleiben
nur Produktionsabhängigkeiten. Der Container läuft **als Benutzer `node`** mit **read-only
Dateisystem**; beschreibbar ist nur das Volume `/data` mit der SQLite-Datei. SQLite steckt über
`node:sqlite` in Node selbst – es gibt keine native Abhängigkeit, die kompiliert werden müsste.

### Hinter dem Reverse Proxy

Der Container spricht nur HTTP auf Port 8080 und erwartet, dass davor jemand TLS terminiert:

- `BIND_ADDRESS=127.0.0.1` in der `.env`, wenn der Proxy auf demselben Host läuft
- `TRUST_PROXY=1` (Anzahl der Proxys) setzen, damit die echte Client-IP für die Login-Bremse
  stimmt. **Ohne echten Proxy davor auf `0` (Standard) lassen** – sonst kann jeder Client per
  `X-Forwarded-For`-Header eine beliebige Absender-IP behaupten und die Login-Bremse umgehen
- `COOKIE_SECURE=true` lassen – das Session-Cookie soll nur über HTTPS reisen
- Der Proxy muss `X-Forwarded-For` und `X-Forwarded-Proto` setzen

**Ohne HTTPS bitte nicht ins Internet stellen.** Mit `COOKIE_SECURE=true` kommt über reines HTTP
keine Anmeldung zustande, und iOS installiert die PWA ohnehin nur über HTTPS.

### Datensicherung

Alles steckt in einer Datei im Volume:

```bash
docker compose exec schnapsapp sh -c 'cat /data/schnapsen.sqlite' > sicherung.sqlite
```

Sauberer, weil konsistent auch während Schreibzugriffen:

```bash
docker compose stop
docker run --rm -v schnapsapp_schnapsen-daten:/data -v "$PWD":/sicherung alpine \
  tar czf /sicherung/schnapsen-daten.tar.gz -C /data .
docker compose start
```

## Umgebungsvariablen

| Variable | Standard | Bedeutung |
| -------- | -------- | --------- |
| `PORT` | `8080` | Port im Container |
| `DATA_DIR` | `/data` | Verzeichnis der SQLite-Datei |
| `STATIC_DIR` | `/srv/static` | Gebaute PWA |
| `TRUST_PROXY` | `0` | Anzahl vertrauenswürdiger Proxys. `0` = keinem Proxy-Header vertrauen (sicherer Standard); nur hochsetzen, wenn wirklich ein Reverse Proxy davorsteht |
| `COOKIE_SECURE` | `true` | Session-Cookie nur über HTTPS |
| `SESSION_DAYS` | `30` | Gültigkeit einer Anmeldung |
| `ADMIN_USER` | `admin` | Name des ersten Administrators |
| `ADMIN_PASSWORD` | – | Passwort des ersten Administrators; leer = zufällig, steht im Log |
| `LOGIN_ATTEMPTS` | `10` | Fehlversuche pro IP und Zeitfenster |
| `LOGIN_WINDOW_MINUTES` | `15` | Länge dieses Zeitfensters |

## Sicherheit

- Passwörter werden mit **scrypt** und zufälligem Salt gespeichert, Vergleich zeitkonstant
- Sitzungen liegen als **Hash** in der Datenbank, im Cookie steht nur der Token
- Cookie: `httpOnly`, `sameSite=lax`, `secure` (abschaltbar für lokale Tests)
- Schreibende Aufrufe verlangen `Content-Type: application/json` – zusammen mit `sameSite=lax`
  blockt das Formular-Anfragen von fremden Seiten (CSRF)
- Login-Bremse pro IP; Anmeldeversuche für unbekannte Benutzer brauchen gleich lange wie echte
  (verhindert, dass sich Benutzernamen über die Antwortzeit erraten lassen)
- `TRUST_PROXY` ist standardmäßig `0` – ohne echten Reverse Proxy davor lässt sich die Login-Bremse
  sonst per gefälschtem `X-Forwarded-For`-Header umgehen (jede Anfrage "kommt" dann von einer
  anderen IP). Nur explizit hochsetzen, wenn tatsächlich ein Proxy davorsteht
- Sicherheits-Header auf jeder Antwort: `Content-Security-Policy`, `X-Content-Type-Options`,
  `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, sowie `Strict-Transport-Security`
  sobald `COOKIE_SECURE=true`
- Einzelne Sync-Einträge sind auf 100 KB begrenzt – schützt vor einem angemeldeten Benutzer, der
  über viele Aufrufe hinweg gezielt die Datenbank aufbläht
- Der letzte Administrator und das eigene Konto lassen sich nicht löschen
- Beim Passwortwechsel werden alle anderen Sitzungen beendet

**Bekannte Grenze:** Alle angemeldeten Benutzer teilen sich vollen Lese-/Schreibzugriff auf die
Spieldaten (siehe oben), es gibt keine Mengenbegrenzung über alle Sync-Aufrufe hinweg. Für den
vorgesehenen Einsatz (Familie/Freunde, denen man ohnehin ein Konto gibt) ist das eine bewusste
Vereinfachung – nicht geeignet, um Konten an Unbekannte zu vergeben.

## Projektstruktur

```
src/core/        Spiellogik, Statistik, Abgleich – reines TypeScript, ohne React
  schnapsen.ts   Bummerl-/Punktelogik inkl. Undo, Weiterspielen, Zweier/Vierer
  ranks.ts       Einstufung in die Rang-Stufen
  stats.ts       Statistik je Spieler bzw. Team
  storage.ts     localStorage mit defensivem Parsen und Migration v1 → v2
  store.ts       Store + Actions (useSyncExternalStore)
  sync.ts        Änderungen sammeln und zusammenführen (last write wins)
  session.ts     Anmeldestatus und Abgleich-Zeitsteuerung
  api.ts         Aufrufe an den Server
src/screens/     Start, Spiel, Einstellungen, Ranks, Historie, Statistik, Login, Benutzer
src/components/  Screen-Rahmen, Dialog, Sync-Anzeige
server/src/      Express-API, SQLite, Anmeldung, Synchronisation
scripts/         PNG-Generator für die PWA-Icons (ohne externe Dependencies)
```

Die Logik in `src/core/` und `server/src/` ist bewusst UI-unabhängig und durch Tests abgedeckt
(92 Tests insgesamt).
