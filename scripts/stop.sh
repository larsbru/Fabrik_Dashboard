#!/bin/bash
# Fabrik Dashboard - Stop Script

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

echo "Stopping Fabrik Dashboard..."
docker compose down
echo "Dashboard stopped."
