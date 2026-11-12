#!/usr/bin/env bash
#
# The nightly backup: dump the database, prove the dump restores, encrypt it.
# Run by .github/workflows/backup.yml; runnable by hand with the same inputs.
#
#   SOURCE_URL     direct (unpooled) connection to the database to back up.
#                  pg_dump over PgBouncer fails in ways that never say so.
#   RESTORE_URL    an empty scratch database the dump is restored into.
#                  Everything in it is dropped first.
#   AGE_RECIPIENT  the age public key ("age1...") the copy is encrypted to.
#                  Only the matching private key, held offline, can read it.
#   OUT_DIR        where the encrypted file is written.
#   PG_BIN         optional: directory of a pg_dump/pg_restore at least as new
#                  as the server.
#
# A dump is only kept if it restored cleanly and every table came back with
# the rows it had: a backup nobody has restored is a hope, not a backup.
# Prints key=value lines (file, name, bytes, tables, rows) and appends them to
# $GITHUB_OUTPUT when set.

set -euo pipefail

: "${SOURCE_URL:?SOURCE_URL is not set}"
: "${RESTORE_URL:?RESTORE_URL is not set}"
: "${AGE_RECIPIENT:?AGE_RECIPIENT is not set (the age public key, age1...)}"
: "${OUT_DIR:?OUT_DIR is not set}"

bin() { if [ -n "${PG_BIN:-}" ]; then echo "$PG_BIN/$1"; else echo "$1"; fi; }

case "$SOURCE_URL" in
  *-pooler*) echo "SOURCE_URL is the pooled connection. Use the direct one (DATABASE_URL_UNPOOLED)." >&2; exit 1 ;;
esac
# The scratch database is emptied before every restore. Never let that be
# the live one, or any database on Neon.
if [ "$RESTORE_URL" = "$SOURCE_URL" ]; then
  echo "RESTORE_URL is the database being backed up. It must be a scratch database." >&2; exit 1
fi
case "$RESTORE_URL" in
  *neon.tech*) echo "RESTORE_URL is on Neon. The restore test empties its target, so it must be a scratch Postgres." >&2; exit 1 ;;
esac
case "$AGE_RECIPIENT" in
  age1*) ;;
  *) echo "AGE_RECIPIENT does not look like an age public key (age1...)." >&2; exit 1 ;;
esac

mkdir -p "$OUT_DIR"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

stamp=$(date -u +%Y-%m-%dT%H%MZ)
name="qriateplus-db-$stamp"
dump="$work/$name.dump"

# Exact row counts for every table in the schemas we own and the managed
# auth service's, as "schema.table<TAB>rows", sorted.
COUNT_SQL=$(cat <<'SQL'
select string_agg(
         format('select %L, count(*) from %I.%I', schemaname || '.' || tablename, schemaname, tablename),
         ' union all ' order by schemaname, tablename)
from pg_tables
where schemaname in ('public', 'neon_auth')
SQL
)
counts() {
  local url=$1 query
  query=$(psql "$url" -X -At -v ON_ERROR_STOP=1 -c "$COUNT_SQL")
  if [ -z "$query" ]; then return 0; fi
  psql "$url" -X -At -F $'\t' -v ON_ERROR_STOP=1 -c "$query" | sort
}

echo "Dumping..."
"$(bin pg_dump)" --format=custom --compress=9 --no-owner --no-privileges \
  --dbname="$SOURCE_URL" --file="$dump"

# Counted after the dump: a row written meanwhile is in the source and not in
# the copy, which the comparison below allows for.
counts "$SOURCE_URL" > "$work/source.tsv"

echo "Restoring into the scratch database..."
PGOPTIONS="-c client_min_messages=warning" psql "$RESTORE_URL" -X -q -v ON_ERROR_STOP=1 \
  -c "drop schema if exists neon_auth cascade; drop schema if exists public cascade; create schema public;"
set +e
"$(bin pg_restore)" --no-owner --no-privileges --dbname="$RESTORE_URL" "$dump" 2> "$work/restore.log"
restore_status=$?
set -e

# The one kind of error allowed: an extension the managed service has and a
# plain Postgres does not. Anything else means the copy is not whole.
errors=$(grep -E "^pg_restore: error:" "$work/restore.log" | grep -viE "extension" || true)
if [ -n "$errors" ]; then
  echo "The dump did not restore cleanly:" >&2
  echo "$errors" | head -20 >&2
  exit 1
fi
if [ "$restore_status" -ne 0 ]; then
  echo "pg_restore reported only extension errors, which are expected on a plain Postgres:"
  grep -E "^pg_restore: error:" "$work/restore.log" | head -5 || true
fi

counts "$RESTORE_URL" > "$work/restored.tsv"

# Every table must come back, with its rows (compare-counts.sh).
if ! problems=$("$(dirname "$0")/compare-counts.sh" "$work/source.tsv" "$work/restored.tsv"); then
  echo "The restored copy does not match the database:" >&2
  echo "$problems" >&2
  exit 1
fi

tables=$(wc -l < "$work/source.tsv" | tr -d ' ')
if [ "$tables" -eq 0 ]; then
  echo "The database has no tables to back up. Is SOURCE_URL the right database?" >&2
  exit 1
fi
rows=$(awk -F '\t' '{ s += $2 } END { print s + 0 }' "$work/restored.tsv")

latest=$(psql "$RESTORE_URL" -X -At -c "select max(version) from schema_migrations" 2>/dev/null || true)
echo "Restored $tables tables, $rows rows, schema at ${latest:-unknown}."

# Encrypt, then keep only the encrypted file. The plain dump never leaves the
# work directory, which is removed on exit.
file="$OUT_DIR/$name.dump.age"
age --encrypt --recipient "$AGE_RECIPIENT" --output "$file" "$dump"
bytes=$(wc -c < "$file" | tr -d ' ')

{
  echo "file=$file"
  echo "name=$name"
  echo "bytes=$bytes"
  echo "tables=$tables"
  echo "rows=$rows"
  echo "schema=${latest:-}"
} | tee -a "${GITHUB_OUTPUT:-/dev/null}"
