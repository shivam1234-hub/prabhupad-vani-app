#!/usr/bin/env python3
"""
Sanity-check a screens.json against its audio: for a sample of screens,
extract just that audio slice and run an independent ASR pass on it, then
compare the ASR's own words against the screen's claimed words. High overlap
means the claimed timestamps really do correspond to what's spoken there.

Usage:
  python verify_sync.py <audio> <screens.json> [--n 8]
"""
import argparse
import json
import re
import subprocess
import sys
import tempfile


def words_of(text):
    return set(re.findall(r"[a-z']+", text.lower()))


def extract_clip(audio, start, end, out_path):
    pad = 0.3
    subprocess.run(
        ["ffmpeg", "-y", "-ss", str(max(0, start - pad)), "-to", str(end + pad),
         "-i", audio, "-ac", "1", "-ar", "16000", out_path],
        check=True, capture_output=True,
    )


def main():
    p = argparse.ArgumentParser()
    p.add_argument("audio")
    p.add_argument("screens_json")
    p.add_argument("--n", type=int, default=8)
    args = p.parse_args()

    data = json.load(open(args.screens_json))
    screens = data["screens"]
    idxs = sorted(set(int(i * (len(screens) - 1) / (args.n - 1)) for i in range(args.n)))

    from faster_whisper import WhisperModel
    model = WhisperModel("small", device="auto", compute_type="auto")

    results = []
    for idx in idxs:
        s = screens[idx]
        claimed = " ".join(s["lines"])
        claimed_words = words_of(claimed)

        with tempfile.NamedTemporaryFile(suffix=".wav") as tmp:
            extract_clip(args.audio, s["start"], s["end"], tmp.name)
            segments, _ = model.transcribe(tmp.name, language="en", vad_filter=False)
            heard = " ".join(seg.text for seg in segments)
        heard_words = words_of(heard)

        overlap = len(claimed_words & heard_words) / max(1, len(claimed_words))
        results.append({
            "screen_idx": idx,
            "start": s["start"],
            "end": s["end"],
            "overlap": round(overlap, 2),
            "claimed_word_count": len(claimed_words),
            "heard_word_count": len(heard_words),
        })
        print(f"screen {idx:4d}  t={s['start']:7.1f}-{s['end']:7.1f}  overlap={overlap:.2f}  "
              f"claimed_words={len(claimed_words):3d}  heard_words={len(heard_words):3d}", file=sys.stderr)

    avg = sum(r["overlap"] for r in results) / len(results)
    print(json.dumps({"avg_overlap": round(avg, 3), "samples": results}, indent=2))


if __name__ == "__main__":
    main()
