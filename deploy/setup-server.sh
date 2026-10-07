#!/usr/bin/env bash
# Hardening and setup of a fresh Ubuntu 24.04 droplet for Lovely Farm. Run as root, in two steps,
# so that a mistake can never lock you out:
#
#   1. ADMIN_USER=… ADMIN_KEY='ssh-ed25519 …' ADMIN_PASSWORD=… DEPLOY_KEY='ssh-ed25519 …' bash setup-server.sh prepare
#      → updates, Docker, firewall, fail2ban, automatic security updates, swap, the admin and deploy users,
#        /opt/lovely-farm, daily backups. Root login still works.
#   2. (check that `ssh ADMIN_USER@server` works and `sudo` accepts the password)
#      ADMIN_USER=… bash setup-server.sh lockdown
#      → SSH: no root, no passwords, only the admin and deploy users; root's keys removed, root's password locked.
#
# Both steps are idempotent.
set -euo pipefail
step=${1:?usage: setup-server.sh prepare|lockdown}
: "${ADMIN_USER:?set ADMIN_USER}"
export DEBIAN_FRONTEND=noninteractive
APP=/opt/lovely-farm

prepare() {
  : "${ADMIN_KEY:?set ADMIN_KEY}" "${DEPLOY_KEY:?set DEPLOY_KEY}" "${ADMIN_PASSWORD:?set ADMIN_PASSWORD}"

  apt-get update -q
  apt-get -y -q -o Dpkg::Options::=--force-confold upgrade
  apt-get install -y -q ca-certificates curl ufw fail2ban unattended-upgrades

  # Docker from Docker's own repository
  if ! command -v docker >/dev/null; then
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
      > /etc/apt/sources.list.d/docker.list
    apt-get update -q
    apt-get install -y -q docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  fi
  cat > /etc/docker/daemon.json <<'JSON'
{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "3" }, "live-restore": true, "no-new-privileges": true }
JSON
  systemctl restart docker

  # 2 GB of swap: a 1 GB droplet would otherwise run out of memory on a spike
  if ! swapon --show | grep -q /swapfile; then
    fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
    grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  fi

  # the admin: key login, sudo with a password
  id "$ADMIN_USER" >/dev/null 2>&1 || adduser --disabled-password --gecos '' "$ADMIN_USER"
  usermod -aG sudo,docker "$ADMIN_USER"
  echo "$ADMIN_USER:$ADMIN_PASSWORD" | chpasswd
  install -d -m 700 -o "$ADMIN_USER" -g "$ADMIN_USER" "/home/$ADMIN_USER/.ssh"
  echo "$ADMIN_KEY" > "/home/$ADMIN_USER/.ssh/authorized_keys"
  chown "$ADMIN_USER:$ADMIN_USER" "/home/$ADMIN_USER/.ssh/authorized_keys"
  chmod 600 "/home/$ADMIN_USER/.ssh/authorized_keys"

  # CI: its key may only run deploy.sh (no shell, no forwarding)
  id deploy >/dev/null 2>&1 || adduser --disabled-password --gecos '' deploy
  usermod -aG docker deploy
  passwd -l deploy >/dev/null
  install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
  echo "restrict,command=\"$APP/deploy.sh\" $DEPLOY_KEY" > /home/deploy/.ssh/authorized_keys
  chown deploy:deploy /home/deploy/.ssh/authorized_keys
  chmod 600 /home/deploy/.ssh/authorized_keys

  # the app folder: compose, Caddyfile and scripts are copied here from deploy/ (the admin may read it too)
  install -d -m 750 -o root -g deploy "$APP"
  usermod -aG deploy "$ADMIN_USER"

  # firewall: SSH (rate-limited), HTTP and HTTPS only
  ufw --force reset >/dev/null
  ufw default deny incoming
  ufw default allow outgoing
  ufw limit 22/tcp comment 'ssh'
  ufw allow 80/tcp comment 'http'
  ufw allow 443/tcp comment 'https'
  ufw allow 443/udp comment 'http3'
  ufw --force enable

  # fail2ban: ban an address for an hour after 5 failed SSH logins in 10 minutes
  cat > /etc/fail2ban/jail.d/sshd.local <<'INI'
[sshd]
enabled = true
backend = systemd
maxretry = 5
findtime = 10m
bantime = 1h
INI
  systemctl enable --now fail2ban
  systemctl restart fail2ban

  # automatic security updates, rebooting at night when a kernel update needs it
  cat > /etc/apt/apt.conf.d/20auto-upgrades <<'CONF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
CONF
  cat > /etc/apt/apt.conf.d/52lovely-farm-upgrades <<'CONF'
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "04:30";
CONF

  # daily database backup at 03:15 UTC
  echo "15 3 * * * root $APP/backup.sh >> /var/log/lovely-farm-backup.log 2>&1" > /etc/cron.d/lovely-farm-backup
  chmod 644 /etc/cron.d/lovely-farm-backup
  # weekly refresh of Cloudflare's address ranges (firewall + Caddy); the first run happens after the
  # app files are installed, and from then on 80/443 are open to Cloudflare only
  echo "40 4 * * 1 root [ -x $APP/cloudflare.sh ] && $APP/cloudflare.sh >> /var/log/lovely-farm-cloudflare.log 2>&1" > /etc/cron.d/lovely-farm-cloudflare
  chmod 644 /etc/cron.d/lovely-farm-cloudflare
}

lockdown() {
  # refuse to lock down if the admin cannot log in yet
  [[ -s "/home/$ADMIN_USER/.ssh/authorized_keys" ]] || { echo "no key for $ADMIN_USER — run prepare first" >&2; exit 1; }
  cat > /etc/ssh/sshd_config.d/00-lovely-farm.conf <<CONF
# read before the distribution's files, so these values win
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
AuthenticationMethods publickey
AllowUsers $ADMIN_USER deploy
MaxAuthTries 3
LoginGraceTime 20
X11Forwarding no
AllowAgentForwarding no
AllowTcpForwarding no
ClientAliveInterval 300
ClientAliveCountMax 2
CONF
  sshd -t
  systemctl reload ssh
  # root: no keys, no password
  : > /root/.ssh/authorized_keys
  passwd -l root >/dev/null
}

case "$step" in
  prepare) prepare ;;
  lockdown) lockdown ;;
  *) echo "unknown step: $step" >&2; exit 1 ;;
esac
echo "setup-server: $step done"
