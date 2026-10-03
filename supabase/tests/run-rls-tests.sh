#!/usr/bin/env bash
# Runner for the supabase/tests/rls/*.sql suites.
#
# These files are plain SQL with deliberate negative-path assertions: they raise
# errors on purpose inside SAVEPOINTs and then check the rejection happened. So
# "psql printed an ERROR" is NOT a failure signal. The authoritative signal is
# every assertion row, each of which selects `tag, got, expected`.
#
# Output is forced to unaligned pipe-separated from the command line (only
# 02/03 set `\pset` themselves), so every assertion parses identically.
#
# A suite fails when:
#   * any assertion row has got <> expected (after trimming), or
#   * psql exits non-zero (syntax error, aborted script, lost connection).
#
# Usage: DB=postgresql://... ./run-rls-tests.sh [file-glob]
set -uo pipefail

DB="${DB:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
pattern="${1:-supabase/tests/rls/*.sql}"

status=0

for f in $pattern; do
  [ -e "$f" ] || continue

  out=$(psql "$DB" \
    --pset=format=unaligned \
    --pset=fieldsep='|' \
    -f "$f" 2>&1)
  rc=$?

  read -r n mismatches <<<"$(printf '%s\n' "$out" | awk -F'|' '
    # Header emitted before every result set: not an assertion.
    $1 == "tag" && $2 == "got" && $3 == "expected" { next }
    {
      for (i = 1; i <= NF; i++) {
        gsub(/^[ \t]+|[ \t]+$/, "", $i);
        $i = $i;
      }
      # Real assertion rows have exactly three fields.
      if (NF == 3 && $1 != "") {
        n++;
        if ($2 != $3) printf "    %s: got=%s expected=%s\n", $1, $2, $3;
      }
    }
    END { printf "%d", n+0 }
  ')"

  if [ $rc -ne 0 ]; then
    echo "FAIL (psql exit $rc) $f"
    printf '%s\n' "$out" | grep -iE 'syntax error|fatal error' | head -5 | sed 's/^/    /'
    status=1
  elif [ -n "$mismatches" ]; then
    echo "FAIL (assertion mismatch) $f"
    printf '%s\n' "$mismatches"
    status=1
  else
    echo "PASS  $f  ($n assertions)"
  fi
done

exit $status
