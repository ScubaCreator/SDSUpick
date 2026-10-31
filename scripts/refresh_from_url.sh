#!/bin/sh
set -eu
: "${SDSU_SCHEDULE_XLSX_URL:?Set SDSU_SCHEDULE_XLSX_URL to the current public SDSU schedule report XLSX URL}"
TERM_NAME="${TERM_NAME:-Current Term}"
TERM_ID="${TERM_ID:-current}"
TMP="${TMPDIR:-/tmp}/sdsu-schedule.xlsx"
curl -fL "$SDSU_SCHEDULE_XLSX_URL" -o "$TMP"
python3 "$(dirname "$0")/normalize_sdsu_xlsx.py" "$TMP" "$(dirname "$0")/../data/schedule.json" "$TERM_NAME" "$TERM_ID"
