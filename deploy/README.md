# Production

The game runs on a DigitalOcean droplet (Ubuntu 24.04, 1 vCPU, 512 MB + 2 GB swap) in `/opt/lovely-farm`:

| File | What it does |
|---|---|
| `docker-compose.yml` | the `farm` container (the game) and `caddy` (HTTPS reverse proxy); only Caddy publishes ports |
| `Caddyfile` | reverse proxy, compression, HSTS; with a domain it gets Let's Encrypt certificates by itself |
| `.env` (on the server only) | `SITE_ADDRESS` and `SECURE_COOKIE` |
| `deploy.sh` | the forced command of the CI key: loads the image from stdin, restarts, health check, rollback |
| `backup.sh` | nightly consistent SQLite copy to `/var/backups/lovely-farm`, 14 days kept (cron 03:15 UTC) |
| `setup-server.sh` | one-time hardening of a fresh droplet, in two steps (`prepare`, then `lockdown`) |

## Security

- **SSH**: root login disabled and root's keys removed; keys only (no passwords, no keyboard-interactive); only the users `elkhan` (admin, `sudo` with a password) and `deploy` (CI) may log in; `MaxAuthTries 3`; no forwarding.
- **CI key**: `restrict,command="/opt/lovely-farm/deploy.sh"` — it cannot open a shell or forward anything; it can only deploy an image named `lovely-farm:*` (or run `status`). It lives only in the GitHub secret `DEPLOY_SSH_KEY`.
- **Firewall (ufw)**: incoming denied except 22/tcp (rate-limited: 6 connections per 30 s per IP), 80/tcp, 443/tcp+udp. Docker publishes only Caddy's 80/443; the game's 3000 is internal.
- **fail2ban**: 5 failed SSH logins in 10 minutes → banned for an hour.
- **Updates**: unattended security upgrades, automatic reboot at 04:30 UTC when needed (the containers restart by themselves).
- **Containers**: the game runs as the unprivileged `node` user, read-only filesystem, all capabilities dropped, `no-new-privileges`, memory and process limits; Caddy keeps only `NET_BIND_SERVICE`.
- **App**: strict Content-Security-Policy and security headers, `TRUST_PROXY=1` so the sign-in rate limit uses the real client IP from Caddy.

## CI/CD

`.github/workflows/ci.yml`: every push and PR runs `npm run test:all`. On `main`, after green tests, the image is built on the runner and streamed to the server: `docker save | gzip | ssh deploy@server`. GitHub secrets: `DEPLOY_HOST`, `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS` (the server's ED25519 host key, so CI refuses an impostor).

## Common tasks (as `elkhan`)

```bash
ssh elkhan@SERVER
cd /opt/lovely-farm
docker compose ps                        # status
docker compose logs -f --tail 100 farm   # game logs
sudo ./backup.sh                         # backup now
ls /var/backups/lovely-farm              # backups

# roll back to an earlier build (deploy.sh keeps the last three)
docker images lovely-farm
docker tag lovely-farm:<tag> lovely-farm:current && docker compose up -d
```

**Restore a backup**: `docker compose stop farm`, copy the unpacked file into the volume
(`docker run --rm -v lovely-farm_farm-data:/data -v /var/backups/lovely-farm:/b alpine sh -c 'gunzip -c /b/<file>.gz > /data/farm.sqlite && chown 1000:1000 /data/farm.sqlite'`), `docker compose start farm`.

## Switching on the domain

1. At the registrar: `A lovely-farm.fun → SERVER_IP` and `A www.lovely-farm.fun → SERVER_IP`.
2. When `dig +short lovely-farm.fun` shows the IP, edit `/opt/lovely-farm/.env`:
   `SITE_ADDRESS=lovely-farm.fun, www.lovely-farm.fun` and `SECURE_COOKIE=1`, then `docker compose up -d`.
   Caddy gets the certificates within a minute and redirects HTTP to HTTPS.
