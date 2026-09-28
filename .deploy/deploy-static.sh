#!/usr/bin/env bash
set -euo pipefail
umask 077

# cPanel may invoke deployment with Git environment variables pointing at its
# deployment context. They override `git -C` and can make ls-files appear empty.
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_PREFIX GIT_COMMON_DIR
unset GIT_OBJECT_DIRECTORY GIT_ALTERNATE_OBJECT_DIRECTORIES

source_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
expected_source=/home/u9433102/anugrahplastik-site-git
target_root=/home/u9433102/public_html

if [[ "$source_root" != "$expected_source" || "$(realpath "$target_root")" != "$target_root" ]]; then
  echo 'Refusing deployment from an unexpected repository or to an unexpected document root.' >&2
  exit 1
fi
if [[ "$(git -C "$source_root" rev-parse --show-toplevel)" != "$source_root" ]]; then
  echo 'Git did not resolve the expected deployment checkout.' >&2
  exit 1
fi
if [[ -n "$(git -C "$source_root" status --porcelain)" ]]; then
  echo 'The cPanel repository must have a clean working tree.' >&2
  exit 1
fi
if [[ ! -f "$target_root/index.html" ]] || ! grep -qi 'Anugrah Plastik' "$target_root/index.html"; then
  echo 'The expected Anugrah Plastik homepage is not present at the document root.' >&2
  exit 1
fi

# Check the complete checkout before copying even one asset. Git history may
# contain the revamp, but the checked-out tree must contain public files only.
while IFS= read -r -d '' relative; do
  case "$relative" in
    .cpanel.yml | .deploy/deploy-static.sh | .deploy/README.md | index.html | css/* | fonts/* | img/* | js/*) ;;
    *) echo "Unexpected tracked path: $relative" >&2; exit 1 ;;
  esac
done < <(git -C "$source_root" ls-files -z)

for required in css/main.css img/featured/spacer-conduit-bawah-tanah-lokasi-proyek-1.jpg img/featured/spacer-conduit-bawah-tanah-lokasi-proyek-2.jpg; do
  if ! git -C "$source_root" ls-files --error-unmatch -- "$required" >/dev/null 2>&1; then
    echo "Required site asset is not tracked: $required" >&2
    exit 1
  fi
done

for directory in css fonts img js; do
  if [[ ! -d "$source_root/$directory" || -L "$target_root/$directory" ]]; then
    echo "Missing source directory or unsafe destination: $directory" >&2
    exit 1
  fi
done

validate_file() {
  local relative="$1" source="$source_root/$1" destination="$target_root/$1"
  local parent probe
  parent="$(realpath -m "$(dirname "$destination")")"
  if [[ ! -f "$source" || -L "$source" || -L "$destination" ]]; then
    echo "Missing or unsafe file: $relative" >&2
    exit 1
  fi
  case "$parent" in
    "$target_root" | "$target_root"/*) ;;
    *) echo "Destination escapes document root: $relative" >&2; exit 1 ;;
  esac
  probe="$(dirname "$destination")"
  while [[ "$probe" != "$target_root" ]]; do
    if [[ -L "$probe" ]]; then
      echo "Destination contains a symlink: $relative" >&2
      exit 1
    fi
    probe="$(dirname "$probe")"
  done
  if [[ -e "$destination" && ! -f "$destination" ]]; then
    echo "Destination is not a regular file: $relative" >&2
    exit 1
  fi
}

while IFS= read -r -d '' relative; do
  validate_file "$relative"
done < <(git -C "$source_root" ls-files -z -- css fonts img js)
validate_file index.html

release="$(git -C "$source_root" rev-parse --short=12 HEAD)"
mkdir -p -m 700 "$HOME/.anugrah-site-backups"
backup="$(mktemp -d "$HOME/.anugrah-site-backups/$release.XXXXXX")"
temporary=''
trap 'if [[ -n "$temporary" && -f "$temporary" ]]; then rm -f -- "$temporary"; fi' EXIT

publish_file() {
  local relative="$1" source="$source_root/$1" destination="$target_root/$1"
  local parent="$(dirname "$destination")"
  if [[ -f "$destination" ]] && cmp -s "$source" "$destination"; then
    return
  fi
  if [[ -f "$destination" ]]; then
    mkdir -p "$backup/$(dirname "$relative")"
    cp -p -- "$destination" "$backup/$relative"
    printf 'replaced\t%s\n' "$relative" >> "$backup/manifest.tsv"
  else
    printf 'created\t%s\n' "$relative" >> "$backup/manifest.tsv"
  fi
  mkdir -p "$parent"
  temporary="$(mktemp "$parent/.anugrah-stage.XXXXXXXX")"
  cp -p -- "$source" "$temporary"
  mv -f -- "$temporary" "$destination"
  temporary=''
}

# Publish assets first; switch the homepage to the new references last.
while IFS= read -r -d '' relative; do
  publish_file "$relative"
done < <(git -C "$source_root" ls-files -z -- css fonts img js)
publish_file index.html

echo "Published $release. Changed-file backup: $backup"
