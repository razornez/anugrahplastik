#!/usr/bin/env bash
set -euo pipefail

echo '== timestamp =='
date -Is
echo '== uptime =='
uptime
echo '== memory and swap =='
free -h
swapon --show || true
echo '== disk and inodes =='
df -h /
df -i /
echo '== listening TCP ports =='
ss -ltnp
echo '== largest processes =='
ps -eo pid,user,comm,rss,%cpu --sort=-rss | head -20
echo '== relevant systemd units =='
systemctl list-units --type=service --all 'anugrahplastik-*' 'unity08-*' 2>/dev/null || true
echo '== release roots =='
for directory in /srv/anugrahplastik /var/lib/anugrahplastik; do
  test -e "$directory" && du -h -d 2 "$directory" | sort -h
done
echo '== PostgreSQL databases =='
if command -v sudo >/dev/null && id postgres >/dev/null 2>&1; then
  sudo -u postgres psql -Atc "select datname || E'\t' || pg_size_pretty(pg_database_size(datname)) from pg_database order by pg_database_size(datname) desc;" || true
fi
