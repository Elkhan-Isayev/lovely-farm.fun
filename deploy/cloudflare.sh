#!/usr/bin/env bash
# The site is served through Cloudflare, so only Cloudflare may reach the web ports: anyone hitting
# the server's IP directly would bypass Cloudflare's protection. This script (root, weekly cron)
# fetches Cloudflare's current address ranges and
#   - rewrites the ufw rules for 80/443 to allow only those ranges,
#   - writes them for Caddy (cloudflare.caddy), which then trusts CF-Connecting-IP only from Cloudflare.
set -euo pipefail
APP=/opt/lovely-farm

ranges=$(curl -fsS --retry 3 https://www.cloudflare.com/ips-v4; echo; curl -fsS --retry 3 https://www.cloudflare.com/ips-v6)
ranges=$(echo "$ranges" | grep -E '^[0-9a-fA-F:.]+/[0-9]+$' | sort -u)
count=$(echo "$ranges" | wc -l)
# never apply a broken or empty list: that would cut the site off
if (( count < 10 )); then
  echo "cloudflare.sh: only $count ranges fetched — keeping the current rules" >&2
  exit 1
fi

# Caddy: trusted proxies (reloaded below only if the list changed)
new="trusted_proxies static $(echo "$ranges" | tr '\n' ' ')"
if [[ "$(cat "$APP/cloudflare.caddy" 2>/dev/null)" != "$new" ]]; then
  echo "$new" > "$APP/cloudflare.caddy.tmp"
  chmod 640 "$APP/cloudflare.caddy.tmp" && chgrp deploy "$APP/cloudflare.caddy.tmp"
  mv "$APP/cloudflare.caddy.tmp" "$APP/cloudflare.caddy"
  changed=1
fi

# ufw: drop every existing rule for 80/443, then allow those ports from Cloudflare only
while true; do
  # (no match is the normal end of the loop, not an error)
  n=$(ufw status numbered | { grep -E ' (80|443|80,443)(/tcp|/udp)? ' || true; } | head -n 1 | sed -E 's/^\[ *([0-9]+)\].*/\1/')
  [[ -z "$n" ]] && break
  ufw --force delete "$n" >/dev/null
done
for r in $ranges; do
  ufw allow proto tcp from "$r" to any port 80,443 comment 'cloudflare' >/dev/null
done
echo "cloudflare.sh: web ports open to $count Cloudflare ranges only"

if [[ "${changed:-0}" == 1 ]] && docker compose -f "$APP/docker-compose.yml" ps --status running caddy 2>/dev/null | grep -q caddy; then
  docker compose -f "$APP/docker-compose.yml" restart caddy >/dev/null
  echo "cloudflare.sh: caddy restarted with the new ranges"
fi
