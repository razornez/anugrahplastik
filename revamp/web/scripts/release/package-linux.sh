#!/usr/bin/env bash
set -euo pipefail

output_path="${1:?Usage: package-linux.sh /absolute/path/anugrahplastik-release.tar.gz}"
project_root="$(pwd)"
next_dist_dir="${NEXT_DIST_DIR:-.next}"
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

test -f "$project_root/$next_dist_dir/standalone/server.js" || {
  echo "Missing $next_dist_dir/standalone/server.js. Run the production build first." >&2
  exit 1
}
test -d "$project_root/$next_dist_dir/static" || {
  echo "Missing $next_dist_dir/static. Run the production build first." >&2
  exit 1
}
test -d "$project_root/drizzle" || {
  echo "Missing drizzle migrations." >&2
  exit 1
}

mkdir -p "$release_root/app/.next" "$release_root/ops"
cp -a "$project_root/$next_dist_dir/standalone/." "$release_root/app/"
mkdir -p "$release_root/app/$next_dist_dir"
cp -a "$project_root/$next_dist_dir/static" "$release_root/app/$next_dist_dir/static"
mkdir -p "$release_root/app/public"
cp -a "$project_root/public/." "$release_root/app/public/"
cp -a "$project_root/drizzle" "$release_root/app/drizzle"
mkdir -p "$release_root/app/docs"
mkdir -p "$release_root/app/docs/templates"
cp -a "$project_root/docs/templates/." "$release_root/app/docs/templates/"
# The standalone trace includes database modules needed by the web server, but
# the independent migration runner is not traced by Next. Copy its two runtime
# entry packages as real directories so the VPS never needs pnpm or a build.
mkdir -p "$release_root/app/node_modules"
cp -aL "$project_root/node_modules/drizzle-orm" "$release_root/app/node_modules/drizzle-orm"
cp -aL "$project_root/node_modules/pg" "$release_root/app/node_modules/pg"
install -D -m 0755 "$project_root/scripts/release/migrate-production.mjs" "$release_root/app/scripts/release/migrate-production.mjs"
install -D -m 0755 "$project_root/scripts/release/publish-client-logos.mjs" "$release_root/app/scripts/release/publish-client-logos.mjs"
install -D -m 0644 "$project_root/scripts/release/client-logo-catalog.json" "$release_root/app/scripts/release/client-logo-catalog.json"
install -D -m 0755 "$project_root/scripts/release/publish-document-templates.mjs" "$release_root/app/scripts/release/publish-document-templates.mjs"
install -D -m 0755 "$project_root/scripts/release/smoke-release.sh" "$release_root/app/scripts/release/smoke-release.sh"
install -D -m 0755 "$project_root/scripts/reconcile-landing-assets.mjs" "$release_root/app/scripts/reconcile-landing-assets.mjs"
install -D -m 0755 "$project_root/scripts/import-legacy-portfolio.mjs" "$release_root/app/scripts/import-legacy-portfolio.mjs"
install -D -m 0755 "$project_root/scripts/analytics-worker.cjs" "$release_root/app/scripts/analytics-worker.cjs"
install -D -m 0755 "$project_root/scripts/run-integrations-sync.mjs" "$release_root/app/scripts/run-integrations-sync.mjs"
install -D -m 0644 "$project_root/ops/systemd/anugrahplastik-web.service" "$release_root/ops/systemd/anugrahplastik-web.service"
install -D -m 0644 "$project_root/ops/systemd/anugrahplastik-analytics.service" "$release_root/ops/systemd/anugrahplastik-analytics.service"
install -D -m 0644 "$project_root/ops/systemd/anugrahplastik-integrations.service" "$release_root/ops/systemd/anugrahplastik-integrations.service"
install -D -m 0644 "$project_root/ops/systemd/anugrahplastik-integrations.timer" "$release_root/ops/systemd/anugrahplastik-integrations.timer"
install -D -m 0644 "$project_root/ops/systemd/anugrahplastik-integrations-mail.service" "$release_root/ops/systemd/anugrahplastik-integrations-mail.service"
install -D -m 0644 "$project_root/ops/systemd/anugrahplastik-integrations-mail.timer" "$release_root/ops/systemd/anugrahplastik-integrations-mail.timer"
install -D -m 0644 "$project_root/ops/systemd/anugrahplastik-integrations-ads.service" "$release_root/ops/systemd/anugrahplastik-integrations-ads.service"
install -D -m 0644 "$project_root/ops/systemd/anugrahplastik-integrations-ads.timer" "$release_root/ops/systemd/anugrahplastik-integrations-ads.timer"
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
  # The manifest cannot include itself: its checksum would necessarily change
  # when the manifest is written, making every extracted release fail integrity
  # verification before the canary can run.
  find . -type f ! -name SHA256SUMS -print0 | LC_ALL=C sort -z | xargs -0 sha256sum > SHA256SUMS
)
mkdir -p "$(dirname "$output_path")"
tar -C "$stage_root" --sort=name --owner=0 --group=0 --numeric-owner -czf "$output_path" anugrahplastik-release
tar -tzf "$output_path" | grep -E '(^|/)(\.env($|\.)|app/(storage|tmp|output)/)' && {
  echo "Release archive contains forbidden local files." >&2
  exit 1
} || true
tar -tzf "$output_path" | grep -E '^anugrahplastik-release/app/public/public/' && {
  echo "Release archive contains a duplicated public directory." >&2
  exit 1
} || true
echo "Release artifact created: $output_path"
