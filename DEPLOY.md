# Betrieb auf Proxmox

Ziel: die App läuft dauerhaft in einem LXC-Container auf deinem Proxmox-Host und ist über deine
eigene Domain per HTTPS erreichbar.

Zwei Bausteine:

1. **LXC-Container mit Docker** – darin läuft `docker compose` genau wie lokal beschrieben
   (siehe [`README.md`](README.md#docker)).
2. **Reverse Proxy mit TLS** – terminiert HTTPS für deine Domain und leitet an den Container
   weiter. Der App-Container selbst spricht nur HTTP.

Falls du bereits einen Reverse Proxy betreibst (z. B. für andere Dienste), überspringe Schritt 2
und häng die App dort ein.

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
git clone <URL-deines-Repos> schnapsapp
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

## 4. Reverse Proxy mit automatischem HTTPS

Am wenigsten Handarbeit macht **Caddy**: er holt sich das Zertifikat bei Let's Encrypt selbst und
erneuert es automatisch. Läuft am einfachsten im selben Container.

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

**Alternative:** Nutzt du bereits Nginx Proxy Manager, Traefik oder einen Cloudflare Tunnel
anderswo im Netz, reicht dort ein Eintrag, der auf `http://<Container-IP>:8080` zeigt – dann
brauchst du Caddy in diesem Container nicht.

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
