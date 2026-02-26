#!/bin/bash
# Fabrik Dashboard - Start Script

set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

echo "Starting Fabrik Dashboard..."

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "ERROR: .env not found. Run scripts/setup.sh first."
    exit 1
fi

# Build and start containers
docker compose up -d --build

echo ""
echo "Fabrik Dashboard is running!"
echo "  Frontend:  http://localhost:3000"
echo "  Backend:   http://localhost:8000"
echo "  API Docs:  http://localhost:8000/docs"
echo "  Health:    http://localhost:8000/health"
echo ""
echo "Logs ansehen:  docker compose logs -f"
echo "Stoppen:       docker compose down"
