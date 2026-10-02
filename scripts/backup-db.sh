#!/bin/bash
# backup-db.sh — nightly MariaDB dump for St. Clair's, hardened against the two
# classic ways a backup silently rots:
#   1. A mid-dump failure that gzip happily finishes and reports as success.
#      -> caught by `set -o pipefail` + a gzip integrity check + a size floor.
#   2. Good old backups being pruned while the new ones are broken.
#      -> we VERIFY the dump before it ever becomes "a backup", and only prune
#         old ones AFTER a verified new one exists.
#
# A dump only counts as a backup once it has passed integrity + size checks.
# Trace codes live ONLY in this database (Shopify can't rebuild them), so this
# is the one piece of the system with no external source of truth.
set -euo pipefail

cd /opt/stclairs
# shellcheck disable=SC1091
source .env

BACKUP_DIR=/var/backups/stclairs
RETENTION_DAYS=14
MIN_BYTES=10240            # 10 KB floor — a real dump is far bigger; raise once you know the typical size
# Off-site copy target in rsync/scp syntax, e.g. "backup@10.0.255.x:/backups/stclairs/"
# or a mounted NAS path. REQUIRED for real safety: a backup that only lives on
# VM 107 dies with VM 107. Set BACKUP_OFFSITE_TARGET in .env once chosen.
OFFSITE_TARGET="${BACKUP_OFFSITE_TARGET:-}"

STAMP=$(date +%F_%H%M%S)
mkdir -p "$BACKUP_DIR"
TMP="$BACKUP_DIR/.tmp_stclairs_$STAMP.sql.gz"
DEST="$BACKUP_DIR/stclairs_$STAMP.sql.gz"

log() { echo "$(date -Is) $*"; }

# --- Dump -> gzip into a TEMP file. pipefail makes a dump failure fail the pipe,
#     so gzip finishing cleanly on a truncated stream can't fake success. ---
docker compose exec -T db mariadb-dump -u root -p"$DB_ROOT_PASSWORD" \
  --single-transaction --quick --routines --triggers --events "$DB_NAME" \
  | gzip > "$TMP"

# --- Verify BEFORE it is allowed to become a real backup ---
if ! gzip -t "$TMP"; then
  log "BACKUP FAILED: gzip integrity check failed"; rm -f "$TMP"; exit 1
fi
SIZE=$(stat -c%s "$TMP")
if [ "$SIZE" -lt "$MIN_BYTES" ]; then
  log "BACKUP FAILED: dump too small ($SIZE bytes) — treating as a dump error"; rm -f "$TMP"; exit 1
fi

# --- Promote: only now is it a real backup ---
mv "$TMP" "$DEST"
log "backup OK: $DEST ($SIZE bytes)"

# --- Off-site copy. A local-only backup is a false sense of safety. ---
if [ -n "$OFFSITE_TARGET" ]; then
  if rsync -a "$DEST" "$OFFSITE_TARGET"; then
    log "off-site copy OK: $OFFSITE_TARGET"
  else
    log "OFFSITE COPY FAILED: $OFFSITE_TARGET"; exit 1
  fi
else
  log "WARNING: BACKUP_OFFSITE_TARGET not set — backup is LOCAL-ONLY on VM 107 (not safe against VM loss)"
fi

# --- Prune old LOCAL backups, only after a verified new one exists ---
find "$BACKUP_DIR" -name 'stclairs_*.sql.gz' -mtime +"$RETENTION_DAYS" -delete
log "pruned local backups older than ${RETENTION_DAYS}d"
