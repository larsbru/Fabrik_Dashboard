# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Fabrik Network Dashboard — an internal dashboard for monitoring and controlling a local coding network (192.168.44.x subnet). It auto-discovers machines via ping, collects metrics via SSH, and displays a GitHub pipeline view. Documentation and UI text are in German.

## Development Commands

### Docker (primary workflow)
```bash
./scripts/setup.sh          # First-time setup (generates SSH keys, .env)
./scripts/start.sh          # docker-compose up --build -d
./scripts/stop.sh           # docker-compose down
```

### Backend (local dev)
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend (local dev)
```bash
cd frontend
npm install
npm start                   # Dev server on :3000
npm run build               # Production build
npm test                    # Jest via react-scripts
```

### Access points
- Dashboard: http://localhost:3000
- API Swagger docs: http://localhost:8000/docs
- WebSocket: ws://localhost:8000/ws

## Architecture

**Backend** (FastAPI, Python 3.12) — layered as:
- `backend/app/main.py` — App init, lifespan management, CORS, router registration. Services are instantiated here and injected into routers.
- `backend/app/models/` — Pydantic data models (machine states, GitHub entities)
- `backend/app/services/` — Business logic: `NetworkScanner` (ping-based discovery), `SSHManager` (Paramiko metrics collection), `GitHubService` (httpx to GitHub API), `WebSocketManager` (real-time broadcast), `AlertService`, `Scheduler` (APScheduler background loops)
- `backend/app/routers/` — API endpoints grouped by domain (machines, github, settings, alerts, websocket)
- `backend/app/config.py` — Pydantic Settings loading from environment variables

**Frontend** (React 18, CRA) — component-based:
- `frontend/src/App.js` — Root component, manages view routing (DASHBOARD, MACHINES, GITHUB, SETTINGS) and top-level state
- `frontend/src/components/` — UI components (Sidebar, Header, NetworkOverview, MachineGrid, MachineDetail, GitHubPipeline, GitHubActivity, Settings)
- `frontend/src/hooks/useApi.js` — Fetch wrapper for REST calls to `/api/*`
- `frontend/src/hooks/useWebSocket.js` — WebSocket client with auto-reconnect and exponential backoff (1s→30s)
- `frontend/src/styles/global.css` — Design system: CSS custom properties, dark theme, Apple-inspired aesthetic, Inter font

**Infrastructure:**
- `docker-compose.yml` — Backend uses host network (to reach 192.168.44.x); frontend on port 3000
- `docker/nginx.conf` — Proxies `/api/*` and `/ws` to backend:8000, serves SPA with `try_files` fallback
- `config/machines.yml` — Machine definitions, agent roles, auto-discovery settings

## Key Patterns

- **Async everywhere** in backend: all I/O uses async/await, concurrent operations use `asyncio.gather`
- **In-memory state**: services hold state in dictionaries (no database); machine data comes from live SSH/ping
- **Real-time updates**: backend broadcasts state changes over WebSocket; frontend `useWebSocket` hook consumes them
- **Machine states**: ONLINE, OFFLINE, DEGRADED, UNKNOWN — determined by ping reachability + SSH metrics success
- **Config-driven**: machines defined in YAML, environment variables for secrets and network settings

## Environment Variables

Configured in `.env` (see `.env.example`):
- `GITHUB_TOKEN` — GitHub Personal Access Token
- `GITHUB_OWNER` / `GITHUB_REPO` — Target repository (default: Archyveon_Core)
- `NETWORK_SUBNET` — Subnet to scan (default: 192.168.44.0/24)
- `SCAN_INTERVAL` — Seconds between network scans (default: 60)
- `SSH_KEY_PATH` / `SSH_CONFIG_PATH` — SSH key and machine config file paths
