#!/usr/bin/env bash
# Daily backup of the game database (cron, see setup-server.sh). SQLite's VACUUM INTO makes a
# consistent copy while the game keeps running. Copies older than KEEP_DAYS are deleted.
set -euo pipefail
cd /opt/lovely-farm
DEST=/var/backups/lovely-farm
KEEP_DAYS=${KEEP_DAYS:-14}
mkdir -p "$DEST"
chmod 700 "$DEST"

stamp=$(date -u +%Y-%m-%d-%H%M%S)
docker compose exec -T farm rm -f /tmp/backup.sqlite # left over by an interrupted run
docker compose exec -T farm node -e "
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync('/data/farm.sqlite');
  db.exec(\"VACUUM INTO '/tmp/backup.sqlite'\");
"
# /tmp is a tmpfs, which `docker cp` cannot see: stream the copy out instead
docker compose exec -T farm cat /tmp/backup.sqlite > "$DEST/farm-$stamp.sqlite"
docker compose exec -T farm rm -f /tmp/backup.sqlite
gzip "$DEST/farm-$stamp.sqlite"
chmod 600 "$DEST/farm-$stamp.sqlite.gz"
find "$DEST" -name 'farm-*.sqlite.gz' -mtime +"$KEEP_DAYS" -delete
echo "backup: $DEST/farm-$stamp.sqlite.gz"
