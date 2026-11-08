#!/usr/bin/env bash
# Deploys the main branch of pinillalist on server1. Run as pinilla:  ~/pinillalist/deploy/deploy.sh
# Pulls main into /opt/pinillalist, runs the tests, builds, backs up the database,
# applies migrations and restarts the service. Stops at the first failure.
set -euo pipefail

APP=/opt/pinillalist
DATA=/var/lib/pinillalist
REPO=https://github.com/Pinilla/pinillalist.git
export PATH=/opt/node/bin:$PATH

if [ ! -d "$APP/.git" ]; then
  sudo mkdir -p "$APP"
  sudo chown "$USER:$USER" "$APP"
  git clone "$REPO" "$APP"
fi

cd "$APP"
git fetch origin main
git checkout --detach origin/main
echo "Deploying $(git log -1 --format='%h %s')"

npm ci
npm test
npm run build

if [ -f "$DATA/pinillalist.db" ]; then
  sudo -u pinillalist env PINILLALIST_DATA="$DATA" /opt/node/bin/node scripts/backup-db.ts
fi
sudo -u pinillalist env PINILLALIST_DATA="$DATA" /opt/node/bin/node scripts/migrate.ts

sudo systemctl restart pinillalist
sleep 2
code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3100/login)
if [ "$code" != "200" ]; then
  echo "The app didn't answer after the restart (HTTP $code). Check: journalctl -u pinillalist -n 50" >&2
  exit 1
fi
echo "Deployed. https://list.pinillaweb.org"
