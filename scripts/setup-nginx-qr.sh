#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "Run as root: sudo bash scripts/setup-nginx-qr.sh" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

install -m 644 "$ROOT/deploy/nginx-qr.sixlines.io.conf" /etc/nginx/sites-available/qr.sixlines.io
ln -sf /etc/nginx/sites-available/qr.sixlines.io /etc/nginx/sites-enabled/qr.sixlines.io
nginx -t
systemctl reload nginx

echo "qr.sixlines.io -> http://127.0.0.1:3001"
echo "If TLS fails, run: certbot certonly --nginx -d qr.sixlines.io"
