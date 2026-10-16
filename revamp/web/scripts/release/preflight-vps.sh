#!/usr/bin/env bash
set -euo pipefail

# Read-only gate. Supply paths to already-created, restore-tested backups.
# Never prints environment values, database contents, or credentials.
artifact="${RELEASE_ARTIFACT:-}"
backup_manifest="${BACKUP_MANIFEST:-}"
restore_proof="${RESTORE_PROOF:-}"
peak_extra_mib="${MEASURED_PEAK_EXTRA_MIB:-0}"
db_name="${PRODUCTION_DB_NAME:-anugrahplastik}"
failures=0

gate() {
  local label="$1"; shift
  if "$@" >/dev/null 2>&1; then printf 'SIAP  %s\n' "$label"; else printf 'BELUM %s\n' "$label"; failures=$((failures+1)); fi
}

test_artifact() { [[ -f "$artifact" && "$artifact" == *.tar.gz ]] && tar -tzf "$artifact" >/dev/null; }
test_backup() { [[ -s "$backup_manifest" && -s "$restore_proof" ]] && find "$restore_proof" -mmin -1440 -print -quit | grep -q .; }
test_secrets() {
  local file=/etc/anugrahplastik/web.env
  [[ -r "$file" ]] || return 1
  for key in DATABASE_URL AUTH_SECRET DOCGEN_API_KEY; do
    grep -Eq "^${key}=.+" "$file" || return 1
  done
}
test_provider_mode() {
  local file=/etc/anugrahplastik/web.env
  [[ -r "$file" ]] || return 1
  grep -Eq '^DOCGEN_RENDER_MODE="?provider"?$' "$file" || return 1
  grep -Eq '^APP_ORIGIN="?https://([A-Za-z0-9-]+\.)?anugrahplastik\.com/?"?$' "$file"
}
test_admin() {
  local count
  count="$(sudo -u postgres psql -d "$db_name" -Atqc "select count(*) from users where role='admin' and is_active=true and pin_hash is not null" 2>/dev/null)"
  [[ "$count" =~ ^[0-9]+$ && "$count" -ge 1 ]]
  test -s /srv/anugrahplastik/current/app/scripts/admin-auth-cli.mjs
}
test_migrations() {
  sudo -u postgres psql -d "$db_name" -Atqc "select count(*) from drizzle.__drizzle_migrations" 2>/dev/null | grep -Eq '^[1-9][0-9]*$'
  [[ -s /srv/anugrahplastik/current/app/scripts/release/migrate-production.mjs ]]
}
test_space() {
  [[ -f "$artifact" ]] || return 1
  local free_mib artifact_mib db_mib media_mib required
  free_mib="$(df -Pm /srv/anugrahplastik | awk 'NR==2 {print $4}')"
  artifact_mib="$(( ($(stat -c %s "$artifact") + 1048575) / 1048576 ))"
  db_mib="$(sudo -u postgres psql -d "$db_name" -Atqc "select ceil(pg_database_size(current_database())/1048576.0)::int" 2>/dev/null)"
  media_mib="$(du -sm /var/lib/anugrahplastik/private 2>/dev/null | awk '{print $1}')"
  [[ "$free_mib" =~ ^[0-9]+$ && "$db_mib" =~ ^[0-9]+$ && "$media_mib" =~ ^[0-9]+$ ]] || return 1
  required=$((artifact_mib*3 + db_mib*2 + media_mib*2 + 512))
  printf 'Perkiraan kebutuhan: %s MiB; tersedia: %s MiB.\n' "$required" "$free_mib" >&2
  (( free_mib > required ))
}
test_memory() {
  [[ "$peak_extra_mib" =~ ^[0-9]+$ && "$peak_extra_mib" -gt 0 ]] || return 1
  local before after minimum available
  before="$(awk '/SwapTotal:/ {total=$2} /SwapFree:/ {free=$2} END {print total-free}' /proc/meminfo)"
  minimum=999999999
  for _ in 1 2 3; do
    available="$(awk '/MemAvailable:/ {print int($2/1024)}' /proc/meminfo)"
    (( available < minimum )) && minimum="$available"
    sleep 2
  done
  after="$(awk '/SwapTotal:/ {total=$2} /SwapFree:/ {free=$2} END {print total-free}' /proc/meminfo)"
  printf 'RAM tersedia minimum: %s MiB; kenaikan swap: %s KiB.\n' "$minimum" "$((after-before))" >&2
  (( minimum > peak_extra_mib && after <= before ))
}
test_services() {
  systemctl is-active --quiet anugrahplastik-web nginx postgresql
  curl --fail --silent --show-error --max-time 8 http://127.0.0.1:3050/api/health | grep -E '"status"[[:space:]]*:[[:space:]]*"(ok|healthy)"' >/dev/null
  curl --fail --silent --show-error --max-time 8 https://anugrahplastik.com/ | grep -i 'Anugrah Plastik' >/dev/null
}

gate 'Artefak rilis dapat dibaca' test_artifact
gate 'Backup dan bukti uji restore baru tersedia' test_backup
gate 'Ruang cukup untuk artefak, backup, dan rollback' test_space
gate 'RAM terukur cukup dan swap tidak bertambah' test_memory
gate 'SSH aktif dan mendengar' sh -c 'systemctl is-active --quiet ssh && ss -ltn | grep -Eq ":22[[:space:]]"'
gate 'Secret server tersedia' test_secrets
gate 'Renderer production memakai provider dan origin resmi' test_provider_mode
gate 'Admin pemulihan siap' test_admin
gate 'Database dan migrator dapat dibaca' test_migrations
gate 'Layanan serta landing publik sehat' test_services
printf 'Preflight: %s belum siap. Tidak mengubah VPS.\n' "$failures"
(( failures == 0 ))
