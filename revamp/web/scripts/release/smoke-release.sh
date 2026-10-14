#!/usr/bin/env bash
set -euo pipefail

base_url="${1:-http://127.0.0.1:3050}"
require_health="${REQUIRE_HEALTH:-1}"
work_dir="$(mktemp -d "${TMPDIR:-/tmp}/anugrah-release-smoke.XXXXXX")"

cleanup() {
  case "$work_dir" in
    "${TMPDIR:-/tmp}"/anugrah-release-smoke.*) rm -rf -- "$work_dir" ;;
    *) printf 'Refusing to remove unexpected smoke directory.\n' >&2 ;;
  esac
}
trap cleanup EXIT

fetch() {
  local path="$1"
  local output="$2"
  local status
  status="$(curl --silent --show-error --location --max-time 20 --output "$output" --write-out '%{http_code}' "$base_url$path")"
  if [[ "$status" != "200" ]]; then
    printf 'Smoke failed: %s returned HTTP %s.\n' "$path" "$status" >&2
    exit 1
  fi
  test -s "$output" || {
    printf 'Smoke failed: %s returned an empty body.\n' "$path" >&2
    exit 1
  }
}

if [[ "$require_health" == "1" ]]; then
  fetch "/api/health" "$work_dir/health.json"
  grep -Eq '"status"[[:space:]]*:[[:space:]]*"(ok|healthy)"' "$work_dir/health.json" || {
    printf 'Smoke failed: health payload is not healthy.\n' >&2
    exit 1
  }
fi

fetch "/" "$work_dir/landing.html"
grep -qi 'Anugrah Plastik' "$work_dir/landing.html" || {
  printf 'Smoke failed: landing identity is missing.\n' >&2
  exit 1
}
if grep -Eqi 'Runtime Error|Failed query|DrizzleQueryError|Application error|Internal Server Error' "$work_dir/landing.html"; then
  printf 'Smoke failed: landing contains a runtime-error fingerprint.\n' >&2
  exit 1
fi

fetch "/admin/login" "$work_dir/login.html"
grep -qi 'Username' "$work_dir/login.html" && grep -qi 'PIN' "$work_dir/login.html" || {
  printf 'Smoke failed: username and PIN login controls are missing.\n' >&2
  exit 1
}

printf 'Release smoke passed for %s.\n' "$base_url"
