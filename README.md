# Fabrik Network Dashboard

Internes Dashboard zur Überwachung und Steuerung des Coding-Fabrik-Netzwerks (192.168.44.x).

## Features

- **Netzwerk-Scanning** — Automatische Erkennung aller Maschinen im Netz 192.168.44.0/24
- **SSH-Monitoring** — CPU, RAM, Disk-Auslastung aller Maschinen via SSH
- **Agent-Status** — Prüfung laufender Container und Fabrik-Agenten
- **Auto-Discovery** — Neue Maschinen werden automatisch erkannt und eingebunden
- **GitHub Pipeline** — Live-Ansicht aller Issues und PRs von Archyveon_Core
- **Echtzeit-Updates** — WebSocket-basierte Live-Aktualisierung
- **Apple-Design** — Modernes, dunkles Interface im Apple-Stil

## Architektur

```
┌─────────────────────────────────────────────┐
│  Mac Studio (192.168.44.1)                  │
│  ┌─────────────────────────────────────┐    │
│  │  Docker                              │    │
│  │  ┌──────────┐  ┌──────────────────┐ │    │
│  │  │ Frontend │  │     Backend      │ │    │
│  │  │ React    │──│ FastAPI + SSH    │ │    │
│  │  │ :3000    │  │ :8000           │ │    │
│  │  └──────────┘  └───────┬──────────┘ │    │
│  └────────────────────────┼────────────┘    │
│                           │                  │
│                    SSH + Ping                │
│                           │                  │
├───────────────────────────┼──────────────────┤
│  Netzwerk 192.168.44.x   │                  │
│  ┌─────────┐  ┌─────────┐│  ┌─────────┐    │
│  │Worker-01│  │Worker-02││  │Worker-N │    │
│  │  .10    │  │  .11    ││  │  .xx    │    │
│  └─────────┘  └─────────┘│  └─────────┘    │
└───────────────────────────┴──────────────────┘
```

## Schnellstart

### 1. Setup ausführen

```bash
./scripts/setup.sh
```

### 2. Konfiguration anpassen

`.env` bearbeiten:
```env
GITHUB_TOKEN=ghp_dein_github_token
GITHUB_OWNER=dein_username
GITHUB_REPO=Archyveon_Core
```

### 3. SSH-Schlüssel verteilen

```bash
# Schlüssel auf jede Maschine kopieren
ssh-copy-id -i config/ssh_keys/id_rsa.pub fabrik@192.168.44.10
```

### 4. Starten

```bash
./scripts/start.sh
```

Dashboard öffnen: **http://localhost:3000**

### Stoppen

```bash
./scripts/stop.sh
```

## Konfiguration

### Maschinen (`config/machines.yml`)

Bekannte Maschinen und ihre Rollen definieren:

```yaml
machines:
  - name: "Worker-01"
    ip: "192.168.44.10"
    role: "agent"
    ssh_user: fabrik
    tags:
      - code-agent
```

### Auto-Discovery

Neue Maschinen im Netz werden automatisch erkannt. In `machines.yml` konfigurierbar:

```yaml
auto_discovery:
  enabled: true
  subnet: "192.168.44.0/24"
  default_role: "agent"
```

## API

- **Swagger Docs**: http://localhost:8000/docs
- **Health Check**: http://localhost:8000/health

### Endpoints

| Methode | Pfad | Beschreibung |
|---------|------|--------------|
| GET | `/api/machines` | Alle Maschinen |
| GET | `/api/machines/summary` | Netzwerk-Zusammenfassung |
| POST | `/api/machines/scan` | Netzwerkscan auslösen |
| POST | `/api/machines/{ip}/refresh` | Maschine aktualisieren |
| GET | `/api/github/summary` | GitHub Pipeline-Status |
| GET | `/api/github/issues` | Alle Issues |
| GET | `/api/github/pulls` | Alle Pull Requests |
| POST | `/api/github/sync` | GitHub-Sync auslösen |
| WS | `/ws` | WebSocket für Live-Updates |

## Tech-Stack

- **Backend**: Python 3.12, FastAPI, Paramiko (SSH), httpx
- **Frontend**: React 18, Recharts, Lucide Icons
- **Infra**: Docker, Docker Compose, Nginx
