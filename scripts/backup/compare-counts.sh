#!/usr/bin/env bash
#
# compare-counts.sh SOURCE.tsv RESTORED.tsv
#
# Each file is "schema.table<TAB>rows", one table a line. Prints every table
# that is missing from the restored copy or whose count is off, and exits 1
# if there is any. The source is counted just after the dump, so rows written
# in between are allowed for: the larger of 100 rows or 1% per table.

set -euo pipefail
problems=$(awk -F '\t' '
  NR == FNR { restored[$1] = $2; next }
  {
    if (!($1 in restored)) { print "missing table " $1; next }
    diff = $2 - restored[$1]; if (diff < 0) diff = -diff
    slack = $2 / 100; if (slack < 100) slack = 100
    if (diff > slack) print $1 ": " $2 " rows in the database, " restored[$1] " in the copy"
  }' "$2" "$1")
if [ -n "$problems" ]; then
  echo "$problems"
  exit 1
fi
