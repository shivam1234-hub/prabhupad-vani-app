#!/bin/bash
# "Prabhupāda only" segments for a list of lectures. Resumable.
#   scripts/batch-talk.sh <list.jsonl>     (one {"recordingId","vanisourceUrl"} per line)
# Per lecture: extract transcript parts, download each mp3, forced-align it
# (data/screens/<id>/part-N.json + .words.json, which also enables
# presentation mode), delete the mp3, then write data/talk/<id>.json.
set -uo pipefail
cd "$(dirname "$0")/.."
LIST="$1"
VENV_PY=./.venv/bin/python
LOG_DIR=/tmp/talk-batch-logs
mkdir -p "$LOG_DIR" data/talk
TOTAL=$(wc -l < "$LIST" | tr -d ' ')
COUNT=0
while IFS= read -r line; do
  COUNT=$((COUNT + 1))
  id=$(echo "$line" | python3 -c "import json,sys; print(json.load(sys.stdin)['recordingId'])")
  url=$(echo "$line" | python3 -c "import json,sys; print(json.load(sys.stdin)['vanisourceUrl'])")
  if [ -f "data/talk/$id.json" ]; then echo "[$COUNT/$TOTAL] $id done already"; continue; fi
  T0=$(date +%s)
  SRC="data/screens-src/$id"; mkdir -p "$SRC" "data/screens/$id"
  if [ ! -f "$SRC/manifest.json" ]; then
    npx tsx scripts/extract-transcript-parts.ts --recording-id "$id" --vanisource-url "$url" --out "$SRC" \
      > "$LOG_DIR/$id-extract.log" 2>&1 || { echo "[$COUNT/$TOTAL] $id: extract failed"; continue; }
  fi
  [ -f "$SRC/manifest.json" ] || { echo "[$COUNT/$TOTAL] $id: no manifest"; continue; }
  python3 -c "
import json
m = json.load(open('$SRC/manifest.json'))
for i in m['matchedIndices']:
    print(i, m['audioUrls'][i])
" > "$SRC/parts.txt"
  OK=1
  while read -r idx murl; do
    out="data/screens/$id/part-$idx.json"; mp3="$SRC/part-$idx.mp3"
    [ -f "data/screens/$id/part-$idx.words.json" ] && continue
    if [ ! -f "$mp3" ]; then
      curl -sf -o "$mp3" "${murl// /%20}" || { echo "  $id part-$idx: download failed"; rm -f "$mp3"; OK=0; continue; }
    fi
    OMP_NUM_THREADS=4 "$VENV_PY" scripts/lecture_to_screens.py align "$mp3" --text "$SRC/part-$idx.txt" -o "$out" \
      >> "$LOG_DIR/$id-align.log" 2>&1 || { echo "  $id part-$idx: align failed"; OK=0; continue; }
    rm -f "$mp3"
  done < "$SRC/parts.txt"
  if [ "$OK" -eq 1 ]; then
    python3 -I scripts/talk_segments.py "$id" "$url" 2>>"$LOG_DIR/$id-talk.log" | sed "s/^/[$COUNT\/$TOTAL] /"
    echo "    took $(( $(date +%s) - T0 ))s"
  else
    echo "[$COUNT/$TOTAL] $id: incomplete, re-run to retry"
  fi
done < "$LIST"
node scripts/generate-screens-manifest.js > /dev/null
echo "=== batch complete ==="
