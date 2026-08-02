#!/usr/bin/env bash
#
# auto-commit.sh — watches this repo and commits any change automatically.
#
# Usage:
#   ./auto-commit.sh          # check every 5 seconds (default)
#   ./auto-commit.sh 30       # check every 30 seconds
#
# Stop it with Ctrl+C. Leave it running in a terminal while you work.

set -euo pipefail

# Always operate from the directory this script lives in.
cd "$(dirname "$0")"

INTERVAL="${1:-5}"

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "Error: this directory is not a git repository." >&2
  exit 1
fi

echo "Watching '$(pwd)' for changes (every ${INTERVAL}s). Press Ctrl+C to stop."

while true; do
  # Any staged, unstaged, or untracked changes?
  if [ -n "$(git status --porcelain)" ]; then
    git add -A
    stamp="$(date '+%Y-%m-%d %H:%M:%S')"
    git commit -q -m "Auto-commit: ${stamp}"
    echo "[$stamp] committed changes"
  fi
  sleep "$INTERVAL"
done
