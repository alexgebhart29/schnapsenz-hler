# Betrieb auf Proxmox

Ziel: die App läuft dauerhaft in einem LXC-Container auf deinem Proxmox-Host und ist über deine
eigene Domain per HTTPS erreichbar.

Zwei Bausteine:

1. **LXC-Container mit Docker** – darin läuft `docker compose` genau wie lokal beschrieben
   (siehe [`README.md`](README.md#docker)).
2. **HTTPS von außen** – über **Cloudflare Tunnel** (empfohlen, siehe Schritt 4): kein
   Port-Forwarding am Router nötig, funktioniert auch hinter NAT/CGNAT, automatisches
   Zertifikat. Alternativ ein eigener Reverse Proxy mit Caddy, falls du keine Domain bei
   Cloudflare hast oder bereits einen Proxy betreibst.

---

## 1. LXC-Container anlegen

Ein privilegierter Container ist der pragmatischste Weg, Docker in Proxmox zum Laufen zu bringen
(unprivilegiert geht auch, braucht aber zusätzliche `nesting`/`keyctl`-Freischaltung und mehr
Handarbeit an cgroups – für einen einzelnen Heimserver-Dienst ist der Mehraufwand meist nicht wert).

In der Proxmox-Weboberfläche: **Create CT**

- **Template**: Debian 12 (oder Ubuntu 22.04/24.04)
- **Unprivileged container**: **deaktivieren**
- **Disk**: 8–16 GB reichen bei weitem
- **CPU**: 1–2 Kerne
- **Memory**: 512 MB–1 GB
- **Network**: DHCP oder feste IP in deinem LAN

Nach dem Erstellen, in den **Options** des Containers:

- **Features** → `keyctl` und `nesting` aktivieren (unter Options → Features → Edit)

Container starten und Konsole öffnen (`pct enter <vmid>` auf dem Proxmox-Host oder über die
Weboberfläche).

## 2. Docker im Container installieren

```bash
apt update && apt install -y ca-certificates curl gnupg git
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  > /etc/apt/sources.list.d/docker.list
apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

docker run --rm hello-world   # sollte erfolgreich durchlaufen
```

(Ubuntu-Template: `download.docker.com/linux/ubuntu` statt `debian` verwenden.)

## 3. App holen und konfigurieren

```bash
cd /opt
git clone https://github.com/alexgebhart29/schnapsenz-hler.git schnapsapp
cd schnapsapp
cp .env.example .env
nano .env
```

In der `.env`:

```env
BIND_ADDRESS=127.0.0.1   # nur lokal erreichbar, der Proxy übernimmt außen
PORT=8080
TRUST_PROXY=1
COOKIE_SECURE=true
ADMIN_USER=admin
ADMIN_PASSWORD=          # leer lassen, das Log zeigt dir eins beim ersten Start
```

`BIND_ADDRESS=127.0.0.1` ist wichtig, sobald ein Reverse Proxy davorsteht: der Container-Port ist
dann nur vom Proxy auf demselben Host erreichbar, nicht direkt aus dem LAN oder Internet.

```bash
docker compose up -d --build
docker compose logs -f
```

Beim allerersten Start zeigt das Log das Admin-Passwort einmalig an – notieren, dann `Strg+C`.

**Checkliste vor dem Freigeben ins Internet:** `COOKIE_SECURE=true` (s. o.) und `TRUST_PROXY` passend
zur tatsächlichen Anzahl vorgeschalteter Proxys gesetzt – sonst wird entweder das Session-Cookie im
Klartext übertragen oder die Login-Bremse (IP-Sperre nach Fehlversuchen) lässt sich über gefälschte
`X-Forwarded-For`-Header umgehen.

## 4. HTTPS von außen

### 4a. Cloudflare Tunnel (empfohlen)

Voraussetzung: deine Domain läuft bereits über Cloudflare (DNS dort verwaltet, kostenloser Plan
reicht). Der Tunnel baut die Verbindung **von innen nach außen** zu Cloudflare auf – du musst
weder einen Port an deinem Router freigeben noch eine öffentliche IP haben.

1. [dash.teams.cloudflare.com](https://dash.teams.cloudflare.com) → **Networks → Tunnels →
   Create a tunnel** → Typ „Cloudflared“ → Namen vergeben, z. B. `schnapsapp`.
2. Cloudflare zeigt dir einen Installationsbefehl mit einem langen **Token** – nur den Token
   brauchst du, kopieren.
3. Im selben Assistenten, Tab **„Public Hostname“**: Hostname `schnapsen.deine-domain.at`
   eintragen, **Service**: `HTTP`, **URL**: `schnapsapp:8080` (der Compose-Servicename – die
   beiden Container sprechen intern direkt miteinander, ganz ohne den Host-Port). Speichern –
   Cloudflare legt den passenden DNS-Eintrag automatisch an.
4. In der `.env`:

   ```env
   COMPOSE_PROFILES=cloudflare
   CLOUDFLARE_TUNNEL_TOKEN=<der Token aus Schritt 2>
   ```

5. Neu starten, damit der Tunnel-Dienst mitgestartet wird:

   ```bash
   docker compose up -d
   docker compose logs -f cloudflared   # sollte "Registered tunnel connection" zeigen
   ```

Das Cookie bleibt trotzdem `secure` (Browser ↔ Cloudflare ist HTTPS, das zählt) und
`TRUST_PROXY=1` bleibt richtig – cloudflared reicht die echte Client-IP unverändert als
`X-Forwarded-For` durch, genau ein Hop.

**Für maximale Absicherung** kannst du danach den Host-Port ganz schließen, weil cloudflared die
App bereits über das interne Docker-Netzwerk erreicht: In der `.env` `BIND_ADDRESS=127.0.0.1`
setzen (Standard sowieso schon empfohlen) oder den `ports:`-Abschnitt in der
`docker-compose.yml` ganz entfernen, wenn du auch keinen lokalen Zugriff mehr brauchst.

### 4b. Alternative: eigener Reverse Proxy mit Caddy

Falls deine Domain nicht bei Cloudflare liegt oder du lieber selbst terminierst: **Caddy** holt
sich das Zertifikat bei Let's Encrypt selbst und erneuert es automatisch. Läuft am einfachsten
direkt im LXC-Container.

```bash
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  -o /etc/apt/keyrings/caddy-stable.asc
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  -o /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy
```

`/etc/caddy/Caddyfile`:

```caddyfile
schnapsen.deine-domain.at {
    reverse_proxy 127.0.0.1:8080
}
```

```bash
systemctl reload caddy
```

Voraussetzung: `schnapsen.deine-domain.at` zeigt per DNS (A/AAAA-Eintrag) auf die öffentliche
IP deines Proxmox-Hosts, und Port 443 (sowie 80 für die Zertifikatsanfrage) wird an den Host bzw.
diesen Container weitergeleitet (Portweiterleitung im Router, ggf. NAT in Proxmox).

Caddy setzt `X-Forwarded-For` und `X-Forwarded-Proto` automatisch – passend zu `TRUST_PROXY=1`
in der `.env`.

**Alternative:** Nutzt du bereits Nginx Proxy Manager oder Traefik anderswo im Netz, reicht dort
ein Eintrag, der auf `http://<Container-IP>:8080` zeigt – dann brauchst du Caddy in diesem
Container nicht.

## 5. Nach dem Deploy

- App unter `https://schnapsen.deine-domain.at` öffnen, mit dem Admin-Konto anmelden
- Unter **Einstellungen → Konto → Benutzer verwalten** weitere Konten für Mitspieler anlegen
- Am Handy: Safari → Teilen → „Zum Home-Bildschirm“ (nur über HTTPS installierbar)

### Updates einspielen

```bash
cd /opt/schnapsapp
git pull
docker compose up -d --build
```

Die SQLite-Datenbank liegt in einem Docker-Volume und bleibt dabei unangetastet.

### Automatischer Neustart

`restart: unless-stopped` in der `docker-compose.yml` sorgt dafür, dass der Container nach einem
Neustart des LXC-Containers (und damit von Proxmox) automatisch wieder hochkommt, sobald Docker
selbst gestartet ist – das übernimmt der `docker.service` von Debian/Ubuntu bereits automatisch.

### Backup

Am einfachsten über den **Proxmox-Host**: eine reguläre LXC-Sicherung (`vzdump`) des Containers
sichert das Docker-Volume mit. Für ein reines Datenbank-Backup siehe
[README → Datensicherung](README.md#datensicherung).
