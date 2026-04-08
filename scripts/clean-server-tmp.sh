#!/usr/bin/env bash
# Remove Chromium, stream-recognizer capture, and user-data temp dirs under /tmp.
# Intended for the service user that owns those entries (e.g. spotify-musichash-proxy).
set -euo pipefail

TARGET="${1:-/tmp}"

if [[ ! -d "$TARGET" || "$TARGET" != /* ]]; then
  echo "Usage: ${0##*/} [/absolute/path/to/tmp]" >&2
  echo "  Default: /tmp. Path must be absolute." >&2
  exit 1
fi

dry_run=0
if [[ "${DRY_RUN:-}" == 1 ]]; then
  dry_run=1
fi

shopt -s nullglob

matches=()
for name in "$TARGET"/org.chromium.Chromium.* "$TARGET"/sr-cap* "$TARGET"/uc_*; do
  [[ -e "$name" ]] || continue
  matches+=("$name")
done

if [[ ${#matches[@]} -eq 0 ]]; then
  echo "Nothing to remove under $TARGET (patterns: org.chromium.Chromium.*, sr-cap*, uc_*)."
  exit 0
fi

if [[ "$dry_run" -eq 1 ]]; then
  printf 'Would remove:\n'
  printf '  %s\n' "${matches[@]}"
  exit 0
fi

printf 'Removing %d path(s) under %s:\n' "${#matches[@]}" "$TARGET"
printf '  %s\n' "${matches[@]}"
rm -rf -- "${matches[@]}"
echo Done.
