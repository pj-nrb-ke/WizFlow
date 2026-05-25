#!/usr/bin/env bash
# One-time WizFlow install on VPS (WizCRM already present). Run as root.
set -eu

APP_ROOT=/opt/wizflow
WEB_ROOT=/var/www/wizflow-web
REPO=git@github.com-pj-nrb-ke:pj-nrb-ke/WizFlow.git
BRANCH=main

echo "==> Audit ports (read-only)"
ss -tlnp | grep -E ':3000|:5432|:8010|:5433|:6381' || true
docker ps --format 'table {{.Names}}\t{{.Ports}}' || true

if ss -tlnp | grep -q ':8010 '; then
  echo "ERROR: 8010 already in use"
  exit 1
fi

mkdir -p "$APP_ROOT" "$WEB_ROOT" "$APP_ROOT/uploads"

if [ ! -d "$APP_ROOT/.git" ]; then
  git clone -b "$BRANCH" "$REPO" "$APP_ROOT"
fi

# Node for web build
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

bash "$APP_ROOT/scripts/deploy-vps-wizflow.sh"
echo "WizFlow setup complete."
