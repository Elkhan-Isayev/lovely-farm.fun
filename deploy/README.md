# Production

```
player ──HTTPS──▶ Cloudflare (DNS proxied, SSL "Full (strict)") ──HTTPS──▶ droplet: Caddy ──▶ game (127.0.0.1:3000)
```

The game runs on a DigitalOcean droplet (Ubuntu 24.04, 1 vCPU, 512 MB + 2 GB swap) in `/opt/lovely-farm`, behind Cloudflare. The droplet only accepts web traffic from Cloudflare, so nobody can bypass Cloudflare's protection by using the IP:

| File | What it does |
|---|---|
| `docker-compose.yml` | the `farm` container (the game, published on 127.0.0.1 only) and `caddy` on the host network (so ufw applies to it) |
| `Caddyfile` | TLS with the Cloudflare origin certificate, the visitor's IP from `CF-Connecting-IP` (trusted only from Cloudflare), `www` → apex redirect, compression, HSTS, JSON access log |
| `cloudflare.sh` | fetches Cloudflare's IP ranges: ufw allows 80/443 only from them, Caddy trusts only them (weekly cron, Monday 04:40 UTC) |
| `certs/` (on the server only) | `origin.pem` / `origin.key` — Cloudflare Origin CA certificate for `lovely-farm.fun` and `*.lovely-farm.fun`, valid until 2041 |
| `.env` (on the server only) | `SECURE_COOKIE=1` |
| `deploy.sh` | the forced command of the CI key: loads the image from stdin, restarts, health check, rollback |
| `backup.sh` | nightly consistent SQLite copy to `/var/backups/lovely-farm`, 14 days kept (cron 03:15 UTC) |
| `setup-server.sh` | one-time hardening of a fresh droplet, in two steps (`prepare`, then `lockdown`) |

## Security

- **SSH**: root login disabled and root's keys removed; keys only (no passwords, no keyboard-interactive); only the users `elkhan` (admin, `sudo` with a password) and `deploy` (CI) may log in; `MaxAuthTries 3`; no forwarding.
- **CI key**: `restrict,command="/opt/lovely-farm/deploy.sh"` — it cannot open a shell or forward anything; it can only deploy an image named `lovely-farm:*` (or run `status`). It lives only in the GitHub secret `DEPLOY_SSH_KEY`.
- **Firewall (ufw)**: incoming denied except 22/tcp (rate-limited: 6 connections per 30 s per IP) and 80/443 **from Cloudflare's ranges only**. Caddy runs on the host network precisely so that these rules apply (ports published by Docker bypass ufw); the game's 3000 is bound to 127.0.0.1.
- **Cloudflare**: SSL/TLS mode "Full (strict)" — Cloudflare verifies the origin certificate; DDoS protection and caching at the edge; the server's IP never needs to be public.
- **fail2ban**: 5 failed SSH logins in 10 minutes → banned for an hour.
- **Updates**: unattended security upgrades, automatic reboot at 04:30 UTC when needed (the containers restart by themselves).
- **Containers**: the game runs as the unprivileged `node` user, read-only filesystem, all capabilities dropped, `no-new-privileges`, memory and process limits; Caddy keeps only `NET_BIND_SERVICE`.
- **App**: strict Content-Security-Policy (own scripts, Google Fonts, Cloudflare Web Analytics only) and security headers; `TRUST_PROXY=1` so the sign-in rate limit uses the real visitor IP that Caddy resolved from Cloudflare.

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

## DNS and certificates (Cloudflare)

- DNS: `A lovely-farm.fun` and `A www` → the droplet's IP, **proxied** (orange cloud).
- SSL/TLS → Overview: **Full (strict)**. Edge Certificates: Always Use HTTPS on, minimum TLS 1.2.
- A new origin certificate (e.g. when the server is rebuilt): SSL/TLS → Origin Server → Create Certificate, save it as `certs/origin.pem` and `certs/origin.key` (root:deploy, 640), `docker compose restart caddy`.
- A new server: `setup-server.sh prepare`, copy `deploy/*` and `certs/` to `/opt/lovely-farm`, run `cloudflare.sh`, `lockdown`, then point the DNS records at the new IP and push to main (CI deploys the game).
