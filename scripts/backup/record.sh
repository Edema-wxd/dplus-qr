#!/usr/bin/env bash
#
# Write one row to qr_backups, which the app reads to alert staff when backups
# stop (src/lib/backups.ts). Usage: record.sh ok|failed
#
#   SOURCE_URL                    the database the backup was taken from
#   BYTES, TABLES, ROWS, SCHEMA   from backup.sh (blank on a failure)
#   RUN_URL                       the workflow run, for staff to open
#   DETAIL                        optional note

set -euo pipefail
: "${SOURCE_URL:?SOURCE_URL is not set}"
status=${1:?usage: record.sh ok|failed}

psql "$SOURCE_URL" -X -q -v ON_ERROR_STOP=1 \
  -v status="$status" \
  -v bytes="${BYTES:-}" \
  -v tables="${TABLES:-}" \
  -v rows="${ROWS:-}" \
  -v schema="${SCHEMA:-}" \
  -v run_url="${RUN_URL:-}" \
  -v detail="${DETAIL:-}" <<'SQL'
insert into qr_backups (status, bytes, tables, row_count, schema_version, run_url, detail)
values (
  :'status',
  nullif(:'bytes', '')::bigint,
  nullif(:'tables', '')::integer,
  nullif(:'rows', '')::bigint,
  nullif(:'schema', ''),
  nullif(:'run_url', ''),
  nullif(:'detail', '')
);
SQL
echo "Logged the run as $status in qr_backups."
