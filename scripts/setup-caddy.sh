#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "Run as root: sudo bash scripts/setup-caddy.sh" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v caddy >/dev/null 2>&1; then
  apt-get update
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    -o /etc/apt/sources.list.d/caddy-stable.list
  apt-get update
  apt-get install -y caddy
fi

install -d /etc/caddy
install -m 644 "$ROOT/deploy/Caddyfile" /etc/caddy/Caddyfile

if ss -tlnH | grep -qE ':80 |:443 '; then
  if systemctl is-active --quiet nginx; then
    echo "Warning: nginx is listening on 80/443. Stop/disable nginx before starting Caddy, or use deploy/nginx-qr.sixlines.io.conf instead." >&2
  fi
fi

systemctl enable caddy
systemctl reload caddy || systemctl restart caddy
systemctl --no-pager --full status caddy
