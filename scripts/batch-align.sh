#!/bin/bash
# Resumable batch pipeline: extracts transcript, downloads audio, and
# forced-aligns every Bhagavad-gita lecture. Safe to kill and re-run --
# already-completed lectures (marked by a .done file) are skipped, and
# already-downloaded/aligned parts within a partially-failed lecture are
# skipped too, so a re-run only redoes what actually failed.
set -uo pipefail
cd "$(dirname "$0")/.."

VENV_PY=./.venv/bin/python
LOG_DIR=/tmp/bg-batch-logs
mkdir -p "$LOG_DIR"

node scripts/list-bg-lectures.js > /tmp/bg-lectures.jsonl
TOTAL=$(wc -l < /tmp/bg-lectures.jsonl | tr -d ' ')
COUNT=0

while IFS= read -r line; do
  COUNT=$((COUNT + 1))
  recordingId=$(echo "$line" | python3 -c "import json,sys; print(json.load(sys.stdin)['recordingId'])")
  vanisourceUrl=$(echo "$line" | python3 -c "import json,sys; print(json.load(sys.stdin)['vanisourceUrl'])")

  DONE_MARKER="data/screens/$recordingId/.done"
  if [ -f "$DONE_MARKER" ]; then
    echo "[$COUNT/$TOTAL] $recordingId already done, skipping"
    continue
  fi

  echo "[$COUNT/$TOTAL] === $recordingId ==="
  SRC_DIR="data/screens-src/$recordingId"
  mkdir -p "$SRC_DIR"

  if [ ! -f "$SRC_DIR/manifest.json" ]; then
    npx tsx scripts/extract-transcript-parts.ts --recording-id "$recordingId" \
      --vanisource-url "$vanisourceUrl" --out "$SRC_DIR" \
      > "$LOG_DIR/$recordingId-extract.log" 2>&1
    if [ $? -ne 0 ]; then
      echo "[$COUNT/$TOTAL] $recordingId: extract failed, skipping (see $LOG_DIR/$recordingId-extract.log)"
      continue
    fi
  fi

  if [ ! -f "$SRC_DIR/manifest.json" ]; then
    echo "[$COUNT/$TOTAL] $recordingId: no manifest produced, skipping"
    continue
  fi

  mkdir -p "data/screens/$recordingId"

  python3 -c "
import json
m = json.load(open('$SRC_DIR/manifest.json'))
for i in m['matchedIndices']:
    print(i, m['audioUrls'][i])
" > "$SRC_DIR/parts.txt"

  ALL_OK=1
  while read -r idx url; do
    mp3="$SRC_DIR/part-$idx.mp3"
    txt="$SRC_DIR/part-$idx.txt"
    out="data/screens/$recordingId/part-$idx.json"

    if [ -f "$out" ]; then
      continue
    fi

    if [ ! -f "$mp3" ]; then
      echo "  [$recordingId] downloading part-$idx..."
      if ! curl -sf -o "$mp3" "$url"; then
        echo "  [$recordingId] part-$idx: download failed"
        rm -f "$mp3"
        ALL_OK=0
        continue
      fi
    fi

    echo "  [$recordingId] aligning part-$idx..."
    if ! OMP_NUM_THREADS=1 MKL_NUM_THREADS=1 "$VENV_PY" scripts/lecture_to_screens.py align "$mp3" \
      --text "$txt" -o "$out" >> "$LOG_DIR/$recordingId-align.log" 2>&1; then
      echo "  [$recordingId] part-$idx: alignment failed (see $LOG_DIR/$recordingId-align.log)"
      ALL_OK=0
      continue
    fi

    rm -f "$mp3"  # audio no longer needed once aligned -- saves disk across 450+ lectures
  done < "$SRC_DIR/parts.txt"

  if [ "$ALL_OK" -eq 1 ]; then
    touch "$DONE_MARKER"
    echo "[$COUNT/$TOTAL] $recordingId: DONE"
  else
    echo "[$COUNT/$TOTAL] $recordingId: PARTIAL/FAILED -- will retry remaining parts next run"
  fi

  node scripts/generate-screens-manifest.js > /dev/null
done < /tmp/bg-lectures.jsonl

echo "=== batch complete: $COUNT/$TOTAL processed ==="
