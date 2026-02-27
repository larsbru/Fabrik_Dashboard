#!/bin/bash
# Fabrik Dashboard - Dev Mode (macOS)
# Backend runs natively for direct LAN access, frontend in Docker (nginx proxy).

set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

echo "Starting Fabrik Dashboard (Dev-Modus / macOS)..."

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "ERROR: .env not found. Run scripts/setup.sh first."
    exit 1
fi

# Load .env
set -a
source .env
set +a

# Override paths for native execution (Docker paths won't work natively)
export SSH_KEY_PATH="${SSH_KEY_PATH:-$PROJECT_DIR/config/ssh_keys/id_rsa}"
export SSH_CONFIG_PATH="${SSH_CONFIG_PATH:-$PROJECT_DIR/config/machines.yml}"

# Ensure config directory exists
mkdir -p "$PROJECT_DIR/config/ssh_keys"

# Check for Python / uvicorn
if ! command -v uvicorn &> /dev/null; then
    echo "uvicorn nicht gefunden. Installiere Backend-Abhaengigkeiten..."
    pip install -r "$PROJECT_DIR/backend/requirements.txt"
fi

# Start frontend in Docker (nginx proxy to host backend)
echo "Starte Frontend-Container..."
docker compose up -d --build --no-deps frontend

# Start backend natively
echo "Starte Backend nativ (Port 8000)..."
cd "$PROJECT_DIR/backend"
uvicorn app.main:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

# Trap to clean up on exit
cleanup() {
    echo ""
    echo "Stoppe Fabrik Dashboard..."
    kill $BACKEND_PID 2>/dev/null || true
    docker compose stop frontend 2>/dev/null || true
    echo "Gestoppt."
}
trap cleanup EXIT INT TERM

echo ""
echo "Fabrik Dashboard laeuft (Dev-Modus)!"
echo "  Frontend:  http://localhost:3000"
echo "  Backend:   http://localhost:8000 (nativ)"
echo "  API Docs:  http://localhost:8000/docs"
echo ""
echo "Druecke Ctrl+C zum Stoppen."
echo ""

# Wait for backend process
wait $BACKEND_PID
