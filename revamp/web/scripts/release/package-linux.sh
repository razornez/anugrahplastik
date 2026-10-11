#!/usr/bin/env bash
set -euo pipefail

output_path="${1:?Usage: package-linux.sh /absolute/path/anugrahplastik-release.tar.gz}"
project_root="$(pwd)"
stage_root="$(mktemp -d)"
release_root="$stage_root/anugrahplastik-release"

cleanup() {
  [[ "$stage_root" == /tmp/* || "$stage_root" == "${TMPDIR:-/tmp}"/* ]] || {
    echo "Refusing to remove an unexpected staging directory." >&2
    return
  }
  rm -rf -- "$stage_root"
}
trap cleanup EXIT

test -f "$project_root/.next/standalone/server.js" || {
  echo "Missing .next/standalone/server.js. Run the production build first." >&2
  exit 1
}
test -d "$project_root/.next/static" || {
  echo "Missing .next/static. Run the production build first." >&2
  exit 1
}
test -d "$project_root/drizzle" || {
  echo "Missing drizzle migrations." >&2
  exit 1
}

mkdir -p "$release_root/app/.next" "$release_root/ops"
cp -a "$project_root/.next/standalone/." "$release_root/app/"
cp -a "$project_root/.next/static" "$release_root/app/.next/static"
cp -a "$project_root/public" "$release_root/app/public"
cp -a "$project_root/drizzle" "$release_root/app/drizzle"
install -D -m 0755 "$project_root/scripts/release/migrate-production.mjs" "$release_root/app/scripts/release/migrate-production.mjs"
install -D -m 0755 "$project_root/scripts/analytics-worker.cjs" "$release_root/app/scripts/analytics-worker.cjs"
install -D -m 0755 "$project_root/scripts/run-integrations-sync.mjs" "$release_root/app/scripts/run-integrations-sync.mjs"
install -D -m 0644 "$project_root/ops/systemd/anugrahplastik-web.service" "$release_root/ops/systemd/anugrahplastik-web.service"
install -D -m 0644 "$project_root/ops/systemd/anugrahplastik-analytics.service" "$release_root/ops/systemd/anugrahplastik-analytics.service"
install -D -m 0644 "$project_root/ops/systemd/anugrahplastik-integrations.service" "$release_root/ops/systemd/anugrahplastik-integrations.service"
install -D -m 0644 "$project_root/ops/systemd/anugrahplastik-integrations.timer" "$release_root/ops/systemd/anugrahplastik-integrations.timer"
install -D -m 0644 "$project_root/ops/nginx/anugrahplastik.conf.template" "$release_root/ops/nginx/anugrahplastik.conf.template"
install -D -m 0755 "$project_root/scripts/release/audit-vps.sh" "$release_root/ops/audit-vps.sh"

# Next standalone can carry local development files when built from a dirty
# workstation. They are never part of a production release.
rm -rf -- "$release_root/app/storage" "$release_root/app/tmp" "$release_root/app/output"
find "$release_root" -type f \( -name '.env' -o -name '.env.*' \) -print -quit | grep -q . && {
  echo "Release staging unexpectedly contains an environment file." >&2
  exit 1
}

(
  cd "$release_root"
  find . -type f -print0 | LC_ALL=C sort -z | xargs -0 sha256sum > SHA256SUMS
)
mkdir -p "$(dirname "$output_path")"
tar -C "$stage_root" --sort=name --owner=0 --group=0 --numeric-owner -czf "$output_path" anugrahplastik-release
tar -tzf "$output_path" | grep -E '(^|/)(\.env($|\.)|storage/|tmp/|output/)' && {
  echo "Release archive contains forbidden local files." >&2
  exit 1
} || true
echo "Release artifact created: $output_path"
