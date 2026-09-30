#!/usr/bin/env bash
# Stop and remove the Architecture Archive LaunchAgent.

set -euo pipefail

LABEL="com.architecture.archive"
DEST_PLIST="${HOME}/Library/LaunchAgents/${LABEL}.plist"

if [[ -f "${DEST_PLIST}" ]]; then
  launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || \
    launchctl unload "${DEST_PLIST}" 2>/dev/null || true
  rm -f "${DEST_PLIST}"
  echo "Removed ${DEST_PLIST}"
else
  echo "Nothing to remove (no ${DEST_PLIST})."
fi

echo "Done."
