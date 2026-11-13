#!/bin/bash
# Full-library "Prabhupāda only" run: one worker over a list of lectures.
#   scripts/batch-talk-all.sh <list.jsonl>
# Like batch-talk.sh, but the alignment cache (slides + word timings) goes to
# $ALIGN_DIR outside the app, only data/talk/<id>.json lands in the repo, the
# fast "base" anchor model is used, and no manifests are regenerated (run
# `node scripts/generate-talk-manifest.js` when done). Resumable.
set -uo pipefail
cd "$(dirname "$0")/.."
LIST="$1"
export ALIGN_DIR="${ALIGN_DIR:-$HOME/prabhupad-align-cache}"
export ANCHOR_MODEL="${ANCHOR_MODEL:-base}" ANCHOR_THREADS="${ANCHOR_THREADS:-4}" OMP_NUM_THREADS=4
VENV_PY=./.venv/bin/python
LOG_DIR="$ALIGN_DIR/_logs"
mkdir -p "$LOG_DIR" data/talk
TOTAL=$(wc -l < "$LIST" | tr -d ' ')
COUNT=0
while IFS= read -r line; do
  COUNT=$((COUNT + 1))
  id=$(echo "$line" | python3 -c "import json,sys; print(json.load(sys.stdin)['recordingId'])")
  url=$(echo "$line" | python3 -c "import json,sys; print(json.load(sys.stdin)['vanisourceUrl'])")
  [ -f "data/talk/$id.json" ] && continue
  [ -f "$LOG_DIR/$id.skip" ] && continue
  T0=$(date +%s)
  SRC="$ALIGN_DIR/$id/src"; OUT="$ALIGN_DIR/$id"; mkdir -p "$SRC"
  # A network drop used to fail every remaining lecture in seconds; wait for
  # vanisource to answer again before trying (and retrying) the extract.
  wait_net() {
    until curl -sf -o /dev/null --max-time 20 -A PrabhupadaVaniApp/1.0 \
        "https://vanisource.org/w/api.php?action=query&format=json"; do
      echo "    network down, waiting ($(date +%H:%M))"; sleep 120
    done
  }
  if [ ! -s "$SRC/manifest.json" ]; then
    extracted=0
    for attempt in 1 2 3; do
      wait_net
      if npx tsx scripts/extract-transcript-parts.ts --recording-id "$id" --vanisource-url "$url" --out "$SRC" \
          > "$LOG_DIR/$id-extract.log" 2>&1; then extracted=1; break; fi
      sleep 30
    done
    [ "$extracted" -eq 1 ] || { echo "[$COUNT/$TOTAL] $id: extract failed"; continue; }
  fi
  [ -s "$SRC/manifest.json" ] || { echo "[$COUNT/$TOTAL] $id: no transcript/audio match"; touch "$LOG_DIR/$id.skip"; continue; }
  python3 -c "
import json
m = json.load(open('$SRC/manifest.json'))
for i in m['matchedIndices']:
    print(i, m['audioUrls'][i])
" > "$SRC/parts.txt"
  [ -s "$SRC/parts.txt" ] || { echo "[$COUNT/$TOTAL] $id: no matched parts"; touch "$LOG_DIR/$id.skip"; continue; }
  OK=1
  while read -r idx murl; do
    [ -f "$OUT/part-$idx.words.json" ] && continue
    mp3="$SRC/part-$idx.mp3"
    curl -sf --retry 3 -o "$mp3" "${murl// /%20}" || { echo "  $id part-$idx: download failed"; rm -f "$mp3"; OK=0; continue; }
    "$VENV_PY" scripts/lecture_to_screens.py align "$mp3" --text "$SRC/part-$idx.txt" -o "$OUT/part-$idx.json" \
      >> "$LOG_DIR/$id-align.log" 2>&1 || { echo "  $id part-$idx: align failed"; OK=0; }
    rm -f "$mp3"
  done < "$SRC/parts.txt"
  if [ "$OK" -eq 1 ]; then
    python3 -I scripts/talk_segments.py "$id" "$url" 2>>"$LOG_DIR/$id-talk.log" \
      | sed "s/^/[$COUNT\/$TOTAL] /" || echo "[$COUNT/$TOTAL] $id: segmenting failed"
    echo "    took $(( $(date +%s) - T0 ))s"
  else
    echo "[$COUNT/$TOTAL] $id: incomplete, re-run to retry"
  fi
done < "$LIST"
echo "=== worker done: $LIST ==="
