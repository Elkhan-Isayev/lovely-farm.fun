#!/usr/bin/env bash
# CI deploy entry point. It is the forced command of the `deploy` user's SSH key, so the CI key can do
# nothing else: it streams a gzipped `docker save` of the new image on stdin; this script loads it,
# switches the stack to it, waits for the health check and rolls back if the new version does not come up.
#   ssh deploy@server < image.tar.gz      → deploy
#   ssh deploy@server status              → show the running containers
set -euo pipefail
cd /opt/lovely-farm

if [[ "${SSH_ORIGINAL_COMMAND:-}" == "status" ]]; then
  docker compose ps
  exit 0
fi

loaded=$(gunzip | docker load | sed -n 's/^Loaded image: //p' | tail -n 1)
if [[ "$loaded" != lovely-farm:* ]]; then
  echo "refusing to deploy an unexpected image: '$loaded'" >&2
  exit 1
fi

previous=$(docker image inspect -f '{{.Id}}' lovely-farm:current 2>/dev/null || true)
docker tag "$loaded" lovely-farm:current
docker compose up -d --remove-orphans

for _ in $(seq 1 30); do
  if docker compose exec -T farm wget -qO- http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
    echo "deployed $loaded"
    # keep the three newest builds for a manual rollback, drop the rest
    docker images lovely-farm --format '{{.Tag}}' | grep -v '^current$' | tail -n +4 | xargs -r -I{} docker rmi -f "lovely-farm:{}" >/dev/null
    docker image prune -f >/dev/null
    exit 0
  fi
  sleep 2
done

echo "health check failed for $loaded — rolling back" >&2
docker compose logs --tail 50 farm >&2 || true
if [[ -n "$previous" ]]; then
  docker tag "$previous" lovely-farm:current
  docker compose up -d
fi
exit 1
