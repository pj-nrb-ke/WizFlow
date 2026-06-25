#!/usr/bin/env bash
# Deploy WizFlow on Contabo VPS (coexists with WizCRM). Run on server as root.
set -eu

APP_ROOT=/opt/wizflow
WEB_ROOT=/var/www/wizflow-web
DOCKER_DIR=$APP_ROOT/infra/docker
API_URL=https://api.wizflow.biz
WEB_URL=https://app.wizflow.biz
BRANCH=main

echo "==> WizFlow deploy ($BRANCH)"

if [ ! -d "$APP_ROOT/.git" ]; then
  echo "Clone repo first to $APP_ROOT"
  exit 1
fi

cd "$APP_ROOT"
git fetch origin
git stash push -m "deploy-stash-$(date +%s)" 2>/dev/null || true
git checkout "$BRANCH"
git pull origin "$BRANCH"

ENV_FILE=$DOCKER_DIR/.env.prod
if [ ! -f "$ENV_FILE" ]; then
  echo "Creating $ENV_FILE from example..."
  PW=$(openssl rand -hex 16)
  JWT=$(openssl rand -hex 32)
  cp "$DOCKER_DIR/.env.prod.example" "$ENV_FILE"
  sed -i "s/change-me-generate-on-server/$PW/" "$ENV_FILE"
  sed -i "0,/change-me-generate-on-server/s//$JWT/" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
fi

if [ -f "$APP_ROOT/config/secrets/brevo.local.txt" ]; then
  chmod 600 "$APP_ROOT/config/secrets/brevo.local.txt"
fi

mkdir -p "$APP_ROOT/uploads"

echo "==> Docker (API + Postgres + Redis)"
cd "$DOCKER_DIR"
COMPOSE="docker compose -p wizflow -f docker-compose.prod.yml --env-file .env.prod"
$COMPOSE up -d --build

echo "==> DB migrate + seed"
sleep 5
$COMPOSE exec -T api alembic upgrade head
$COMPOSE exec -T api python -m scripts.seed_wisag

echo "==> Web build"
cd "$APP_ROOT/apps/web"
npm ci
VITE_API_URL=$API_URL npm run build

echo "==> Publish static web"
mkdir -p "$WEB_ROOT"
rm -rf "${WEB_ROOT:?}"/*
cp -r dist/* "$WEB_ROOT/"

echo "==> Caddy"
SNIP=$DOCKER_DIR/caddy-wizflow.snippet
if ! grep -q 'api.wizflow.biz' /etc/caddy/Caddyfile 2>/dev/null; then
  echo "" >> /etc/caddy/Caddyfile
  cat "$SNIP" >> /etc/caddy/Caddyfile
fi
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy

echo "==> Smoke"
curl -sf "http://127.0.0.1:8010/api/v1/health" | head -c 200
echo ""
curl -sfI "$WEB_URL" | head -1 || true
curl -sfI "$API_URL/api/v1/health" | head -1 || true

echo "Done. App: $WEB_URL  API: $API_URL"
