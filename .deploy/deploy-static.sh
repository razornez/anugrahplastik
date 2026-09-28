#!/usr/bin/env bash
set -euo pipefail
umask 077

source_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
expected_source=/home/u9433102/anugrahplastik-site-git
target_root=/home/u9433102/public_html

if [[ "$source_root" != "$expected_source" || "$(realpath "$target_root")" != "$target_root" ]]; then
  echo 'Refusing deployment from an unexpected repository or to an unexpected document root.' >&2
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
    .cpanel.yml | .deploy/deploy-static.sh | index.html | css/* | fonts/* | img/* | js/*) ;;
    *) echo "Unexpected tracked path: $relative" >&2; exit 1 ;;
  esac
done < <(git -C "$source_root" ls-files -z)

for directory in css fonts img js; do
  if [[ ! -d "$source_root/$directory" || -L "$target_root/$directory" ]]; then
    echo "Missing source directory or unsafe destination: $directory" >&2
    exit 1
  fi
done

validate_file() {
  local relative="$1" source="$source_root/$1" destination="$target_root/$1"
  local parent
  parent="$(realpath -m "$(dirname "$destination")")"
  if [[ ! -f "$source" || -L "$source" || -L "$destination" ]]; then
    echo "Missing or unsafe file: $relative" >&2
    exit 1
  fi
  case "$parent" in
    "$target_root" | "$target_root"/*) ;;
    *) echo "Destination escapes document root: $relative" >&2; exit 1 ;;
  esac
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
