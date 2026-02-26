#!/bin/bash
# Fabrik Dashboard - Initial Setup Script
# Run this once to prepare the environment on your Mac Studio

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "========================================="
echo "  Fabrik Network Dashboard - Setup"
echo "========================================="
echo ""

# 1. Create .env from example if it doesn't exist
if [ ! -f "$PROJECT_DIR/.env" ]; then
    echo "[1/4] Erstelle .env Konfiguration..."
    cp "$PROJECT_DIR/.env.example" "$PROJECT_DIR/.env"
    echo "  -> .env erstellt. Bitte GitHub Token eintragen!"
    echo ""
else
    echo "[1/4] .env existiert bereits."
fi

# 2. Create SSH key directory
echo "[2/4] Erstelle SSH-Schlüssel Verzeichnis..."
mkdir -p "$PROJECT_DIR/config/ssh_keys"
chmod 700 "$PROJECT_DIR/config/ssh_keys"

if [ ! -f "$PROJECT_DIR/config/ssh_keys/id_rsa" ]; then
    echo "  Kein SSH-Schlüssel gefunden."
    echo "  Option A: Eigenen Schlüssel kopieren:"
    echo "    cp ~/.ssh/id_rsa $PROJECT_DIR/config/ssh_keys/id_rsa"
    echo ""
    echo "  Option B: Neuen Schlüssel generieren:"
    echo "    ssh-keygen -t rsa -b 4096 -f $PROJECT_DIR/config/ssh_keys/id_rsa -N ''"
    echo ""
    read -p "  Soll ein neuer SSH-Schlüssel generiert werden? [y/N] " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        ssh-keygen -t rsa -b 4096 -f "$PROJECT_DIR/config/ssh_keys/id_rsa" -N '' -C "fabrik-dashboard"
        echo "  -> SSH-Schlüssel generiert!"
        echo "  -> Public Key:"
        cat "$PROJECT_DIR/config/ssh_keys/id_rsa.pub"
        echo ""
        echo "  Diesen Public Key auf allen Maschinen im Netz 44 hinterlegen:"
        echo "    ssh-copy-id -i $PROJECT_DIR/config/ssh_keys/id_rsa.pub fabrik@<IP>"
    fi
else
    echo "  SSH-Schlüssel vorhanden."
fi
chmod 600 "$PROJECT_DIR/config/ssh_keys/"* 2>/dev/null || true

# 3. Check Docker
echo ""
echo "[3/4] Prüfe Docker..."
if command -v docker &> /dev/null; then
    echo "  Docker: $(docker --version)"
    if command -v docker-compose &> /dev/null || docker compose version &> /dev/null; then
        echo "  Docker Compose: verfügbar"
    else
        echo "  WARNUNG: Docker Compose nicht gefunden!"
    fi
else
    echo "  FEHLER: Docker nicht installiert!"
    echo "  Bitte Docker Desktop für Mac installieren: https://docker.com/products/docker-desktop"
    exit 1
fi

# 4. Configure .env
echo ""
echo "[4/4] Konfiguration prüfen..."
if grep -q "ghp_your_personal_access_token_here" "$PROJECT_DIR/.env"; then
    echo ""
    echo "  WICHTIG: GitHub Token muss noch konfiguriert werden!"
    echo "  Öffne $PROJECT_DIR/.env und trage ein:"
    echo "    - GITHUB_TOKEN (Personal Access Token mit repo Scope)"
    echo "    - GITHUB_OWNER (Dein GitHub Username)"
    echo ""
fi

echo ""
echo "========================================="
echo "  Setup abgeschlossen!"
echo "========================================="
echo ""
echo "  Nächste Schritte:"
echo "  1. .env konfigurieren (GitHub Token, Owner)"
echo "  2. SSH-Schlüssel auf Zielmaschinen verteilen"
echo "  3. Dashboard starten mit:"
echo "     cd $PROJECT_DIR && docker compose up -d --build"
echo ""
echo "  Dashboard öffnen: http://localhost:3000"
echo ""
