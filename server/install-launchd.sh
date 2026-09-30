#!/usr/bin/env bash
# Register the Architecture Archive as a per-user LaunchAgent so it auto-starts at login
# and is restarted automatically if it ever crashes.

set -euo pipefail

LABEL="com.architecture.archive"
SERVER_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC_PLIST="${SERVER_DIR}/${LABEL}.plist"
DEST_DIR="${HOME}/Library/LaunchAgents"
DEST_PLIST="${DEST_DIR}/${LABEL}.plist"

if [[ ! -f "${SRC_PLIST}" ]]; then
  echo "ERROR: ${SRC_PLIST} not found" >&2
  exit 1
fi

PYTHON_VENV="${SERVER_DIR}/.venv/bin/python"
if [[ ! -x "${PYTHON_VENV}" ]]; then
  echo "ERROR: venv python not found: ${PYTHON_VENV}" >&2
  echo "Create it: cd server && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt" >&2
  exit 1
fi

mkdir -p "${DEST_DIR}"

LEGACY_LABEL="com.dezeen.scraper"
LEGACY_PLIST="${DEST_DIR}/${LEGACY_LABEL}.plist"
if [[ -f "${LEGACY_PLIST}" ]]; then
  launchctl bootout "gui/$(id -u)/${LEGACY_LABEL}" 2>/dev/null || \
    launchctl unload "${LEGACY_PLIST}" 2>/dev/null || true
  rm -f "${LEGACY_PLIST}"
  echo "Migrated legacy ${LEGACY_LABEL}"
fi

# If already loaded, unload first so we pick up changes.
if launchctl list | grep -q "${LABEL}"; then
  echo "Unloading existing ${LABEL}..."
  launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || \
    launchctl unload "${DEST_PLIST}" 2>/dev/null || true
fi

# launchd requires absolute paths; expand __SERVER_DIR__ from this script's directory.
python3 -c "
from pathlib import Path
import sys
server = Path(sys.argv[1])
src = Path(sys.argv[2])
dst = Path(sys.argv[3])
dst.write_text(src.read_text(encoding='utf-8').replace('__SERVER_DIR__', str(server)), encoding='utf-8')
" "${SERVER_DIR}" "${SRC_PLIST}" "${DEST_PLIST}"
echo "Installed -> ${DEST_PLIST} (SERVER_DIR=${SERVER_DIR})"

# Try the modern bootstrap command first; fall back to legacy load.
if launchctl bootstrap "gui/$(id -u)" "${DEST_PLIST}" 2>/dev/null; then
  echo "Bootstrapped via launchctl bootstrap"
else
  launchctl load "${DEST_PLIST}"
  echo "Loaded via launchctl load"
fi

sleep 1
if launchctl list | grep -q "${LABEL}"; then
  echo "OK: ${LABEL} is running. Logs:"
  echo "  /tmp/architecture-archive.out.log"
  echo "  /tmp/architecture-archive.err.log"
  echo "Health check: curl -s http://127.0.0.1:8765/health"
else
  echo "WARNING: ${LABEL} not visible in launchctl list. Check logs above." >&2
  exit 1
fi
