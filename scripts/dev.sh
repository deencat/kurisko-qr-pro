#!/usr/bin/env bash
set -euo pipefail

for port in 3000 3001 3002; do
  if pids=$(lsof -ti tcp:"$port" 2>/dev/null); then
    echo "Killing process(es) on port $port: $pids"
    kill -9 $pids 2>/dev/null || true
  fi
done

if [[ "${1:-}" == "--" && "${2:-}" == "--turbopack" ]]; then
  shift 2
  exec next dev --turbopack "$@"
fi

exec next dev -H 0.0.0.0 "$@"
