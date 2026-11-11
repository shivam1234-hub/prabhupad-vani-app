#!/usr/bin/env python3
"""
Audio -> timestamped 4-line "screens" for a lecture-display app.

Two modes:

  transcribe   Whisper word-level timestamps. Use when you have no transcript.
  align        Forced-align an existing (accurate) transcript to the audio.
               Strongly preferred for Prabhupada lectures: keeps Sanskrit correct.

Install:
  pip install faster-whisper           # transcribe mode
  pip install whisperx                 # align mode (also needs torch)
  ffmpeg must be on PATH

Usage:
  python lecture_to_screens.py transcribe lecture.mp3 -o out.json
  python lecture_to_screens.py align lecture.mp3 --text transcript.txt -o out.json

Output JSON:
  {
    "audio": "lecture.mp3",
    "screens": [
      {"index": 0, "start": 3.12, "end": 11.84,
       "lines": ["line one", "line two", "line three", "line four"]}
    ]
  }
"""

import argparse
import os
import json
import math
import re
import sys

# ---------------------------------------------------------------- tuning knobs

MAX_LINE_CHARS = 46      # chars per displayed line; tune to your font/viewport
LINES_PER_SCREEN = 2     # overridable via --lines-per-screen
                         # 6 lines held a slide on screen for ~26s on average
                         # (Prabhupada speaks at ~1.3 words/sec), which reads as
                         # out-of-sync because you cannot tell which line is
                         # being spoken. 2 lines lands around ~10s.
PAUSE_BREAK = 0.55       # gap (s) that is a good place to end a screen
HARD_PAUSE = 1.20        # gap (s) that forces a screen break regardless of fill
MIN_SCREEN_SEC = 1.20    # don't flash a screen faster than this
LEAD_IN = 0.08           # show screen slightly before first word


# ------------------------------------------------------------------- extractors

def words_from_transcribe(audio, model_size="large-v3", language="en"):
    """Returns [{'word': str, 'start': float, 'end': float}, ...]"""
    from faster_whisper import WhisperModel

    model = WhisperModel(model_size, device="auto", compute_type="auto")
    segments, _info = model.transcribe(
        audio,
        language=language,
        word_timestamps=True,
        vad_filter=True,
        # a hint helps Whisper with the domain vocabulary
        initial_prompt=(
            "A lecture on the Bhagavad-gita by A.C. Bhaktivedanta Swami "
            "Prabhupada, with Sanskrit verses, Krishna, Arjuna, Kurukshetra, "
            "Sanjaya, Dhritarashtra, bhakti-yoga, atma, Vedanta."
        ),
    )

    words = []
    for seg in segments:
        for w in (seg.words or []):
            tok = w.word.strip()
            if tok:
                words.append({"word": tok, "start": w.start, "end": w.end})
    return words


CHUNK_SECONDS = 90       # cap on any single forced-alignment call -- keeps peak memory bounded
_TOKEN_RE = re.compile(r"[a-z0-9']+")


def _normalize(word):
    m = _TOKEN_RE.findall(word.lower())
    return "".join(m) if m else ""


def _asr_words(audio, language):
    """Word-level ASR pass used ONLY to find ground-truth anchor points.
    Its own words can be wrong (mangles Sanskrit/proper nouns) but the
    *timestamp* of any word it transcribes correctly is real acoustic
    evidence. Matching these against the real transcript (see
    words_from_align) gives frequent, self-correcting anchors throughout the
    file, instead of one assumption (constant pace, or constant word
    density) applied blindly across the whole recording -- which drifts
    further out of sync the longer the lecture runs.
    """
    from faster_whisper import WhisperModel

    # The anchor pass only needs timestamps for words it hears correctly, so a
    # smaller model is enough; "base" is ~3x faster than "small" on CPU.
    # ANCHOR_MODEL / ANCHOR_THREADS let a batch run trade speed for accuracy.
    model = WhisperModel(os.environ.get("ANCHOR_MODEL", "small"), device="auto", compute_type="auto",
                         cpu_threads=int(os.environ.get("ANCHOR_THREADS", "0")))
    segments, _info = model.transcribe(audio, language=language, vad_filter=True, word_timestamps=True)
    words = []
    for seg in segments:
        for w in (seg.words or []):
            tok = w.word.strip()
            if tok:
                words.append({"word": tok, "start": w.start, "end": w.end})
    return words


def _align_slice(whisperx, model_a, meta, device, audio_arr, sample_rate,
                  duration, text_words, t_start, t_end):
    """Forced-align a short, tightly-bounded slice of real words against its
    matching audio window. Used to fill the (usually short) gaps between
    anchors -- e.g. a Sanskrit phrase the ASR pass mangled -- where the
    window is small enough that alignment can't drift far even if imperfect.
    """
    t_start = max(0.0, t_start)
    t_end = min(duration, max(t_end, t_start + 0.3))
    start_sample = int(t_start * sample_rate)
    end_sample = int(t_end * sample_rate)
    chunk_audio = audio_arr[start_sample:end_sample]

    out = []
    segments = [{"text": " ".join(text_words), "start": 0.0, "end": t_end - t_start}]
    result = whisperx.align(segments, model_a, meta, chunk_audio, device, return_char_alignments=False)
    for seg in result["segments"]:
        for w in seg.get("words", []):
            if w.get("start") is None:
                continue
            tok = (w.get("word") or "").strip()
            if tok:
                out.append((w["start"] + t_start, w["end"] + t_start))
    return out


def words_from_align(audio, transcript_text, language="en"):
    """Forced alignment: trust the supplied text, learn only the timings.

    Rather than guessing chunk boundaries from clock time or observed word
    density (both drift further out of sync the longer the lecture runs),
    this anchors the real transcript directly to an ASR pass's own
    timestamps wherever the words actually match, then forced-aligns only
    the short gaps in between (e.g. a Sanskrit term the ASR mangled) against
    their own tightly-bounded audio slice. Matches self-correct drift
    continuously instead of compounding it.
    """
    import difflib
    import whisperx

    device = "cuda" if _has_cuda() else "cpu"

    asr_words = _asr_words(audio, language)
    asr_norm = [_normalize(w["word"]) for w in asr_words]

    real_words_raw = transcript_text.strip().split()
    real_norm = [_normalize(w) for w in real_words_raw]

    sm = difflib.SequenceMatcher(None, real_norm, asr_norm, autojunk=False)
    blocks = [b for b in sm.get_matching_blocks() if b.size > 0 and real_norm[b.a]]

    sample_rate = 16000
    audio_arr = whisperx.load_audio(audio)
    duration = len(audio_arr) / sample_rate

    model_a, meta = whisperx.load_align_model(language_code=language, device=device)

    words = [None] * len(real_words_raw)

    # Anchors: matched words get the ASR's own timestamp verbatim -- real
    # acoustic evidence, not a guess.
    for b in blocks:
        for k in range(b.size):
            ri, ai = b.a + k, b.b + k
            words[ri] = {"word": real_words_raw[ri], "start": asr_words[ai]["start"], "end": asr_words[ai]["end"]}

    # Gaps between (or before the first / after the last) anchor, each
    # bounded by real anchor timestamps on whichever sides exist.
    gaps = []
    prev_end_idx, prev_end_time = 0, 0.0
    for b in blocks:
        if b.a > prev_end_idx:
            gaps.append((prev_end_idx, b.a, prev_end_time, asr_words[b.b]["start"]))
        prev_end_idx, prev_end_time = b.a + b.size, asr_words[b.b + b.size - 1]["end"]
    if prev_end_idx < len(real_words_raw):
        gaps.append((prev_end_idx, len(real_words_raw), prev_end_time, duration))

    for gi, (gi_start, gi_end, gt_start, gt_end) in enumerate(gaps):
        gap_words = real_words_raw[gi_start:gi_end]
        if not gap_words:
            continue

        # A gap with no anchor on one side (start of file, or a long
        # unmatched stretch) can span longer than is safe to align in one
        # pass -- split it into bounded sub-windows sharing words by
        # proportion of the sub-window's own duration, same as a normal gap
        # but scoped to a small span so any guess-error can't compound far.
        span = gt_end - gt_start
        n_sub = max(1, math.ceil(span / CHUNK_SECONDS))
        cursor = 0
        for si in range(n_sub):
            sub_start = gt_start + si * (span / n_sub)
            sub_end = gt_start + (si + 1) * (span / n_sub)
            remaining = gap_words[cursor:]
            if not remaining:
                break
            n_words = len(remaining) if si == n_sub - 1 else max(1, round(len(gap_words) / n_sub))
            n_words = min(n_words, len(remaining))
            sub_words = remaining[:n_words]
            cursor += len(sub_words)
            if not sub_words:
                continue
            aligned = _align_slice(whisperx, model_a, meta, device, audio_arr, sample_rate,
                                    duration, sub_words, sub_start, sub_end)
            for j, gw in enumerate(sub_words):
                idx = gi_start + (gi_end - gi_start - len(remaining)) + j
                if j < len(aligned):
                    words[idx] = {"word": gw, "start": aligned[j][0], "end": aligned[j][1]}
                else:
                    frac = j / max(1, len(sub_words) - 1)
                    t = sub_start + frac * (sub_end - sub_start)
                    words[idx] = {"word": gw, "start": t, "end": t + 0.3}

        print(f"  filled gap {gi + 1}/{len(gaps)} ({gt_start:.0f}s-{gt_end:.0f}s, {len(gap_words)} words)", file=sys.stderr)

    print(f"  {len(blocks)} anchor blocks, {sum(b.size for b in blocks)}/{len(real_words_raw)} words directly matched", file=sys.stderr)
    return [w for w in words if w is not None]


def _has_cuda():
    try:
        import torch
        return torch.cuda.is_available()
    except Exception:
        return False


# ------------------------------------------------------------------- grouping

SENTENCE_END = (".", "!", "?", "…")
CLAUSE_END = (",", ";", ":", "—")


def words_to_lines(words):
    """Wrap words into display lines, preferring to break at punctuation."""
    lines, cur = [], []

    def flush():
        if cur:
            lines.append({
                "text": " ".join(w["word"] for w in cur),
                "start": cur[0]["start"],
                "end": cur[-1]["end"],
                "ends_sentence": cur[-1]["word"].endswith(SENTENCE_END),
                "gap_after": 0.0,
            })
            cur.clear()

    for i, w in enumerate(words):
        cur.append(w)
        text_len = sum(len(x["word"]) + 1 for x in cur) - 1
        nxt = words[i + 1] if i + 1 < len(words) else None
        gap = (nxt["start"] - w["end"]) if nxt else 0.0

        at_capacity = text_len >= MAX_LINE_CHARS
        clean_break = w["word"].endswith(SENTENCE_END + CLAUSE_END)

        if at_capacity or gap >= HARD_PAUSE or (clean_break and text_len >= MAX_LINE_CHARS * 0.6):
            flush()
            if lines:
                lines[-1]["gap_after"] = gap
    flush()
    return lines


def lines_to_screens(lines):
    """Pack lines into screens of LINES_PER_SCREEN, breaking early on pauses."""
    screens, buf = [], []

    def emit():
        if not buf:
            return
        start = max(0.0, buf[0]["start"] - LEAD_IN)
        end = buf[-1]["end"]
        if end - start < MIN_SCREEN_SEC:
            end = start + MIN_SCREEN_SEC
        screens.append({
            "index": len(screens),
            "start": round(start, 3),
            "end": round(end, 3),
            "lines": [l["text"] for l in buf],
        })
        buf.clear()

    for ln in lines:
        buf.append(ln)
        full = len(buf) >= LINES_PER_SCREEN
        good_stop = (
            len(buf) >= 2
            and (ln["gap_after"] >= PAUSE_BREAK or ln["ends_sentence"])
            and len(buf) >= LINES_PER_SCREEN - 1
        )
        if full or good_stop:
            emit()
    emit()

    # Nudge each screen's end up to the next screen's start so there is never
    # a dead frame with nothing on screen.
    for a, b in zip(screens, screens[1:]):
        if b["start"] > a["end"]:
            a["end"] = b["start"]
    return screens


# ----------------------------------------------------------------------- main

def main():
    global LINES_PER_SCREEN

    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("mode", choices=["transcribe", "align", "regroup"])
    p.add_argument("audio", nargs="?", help="not needed for regroup mode")
    p.add_argument("--text", help="transcript file (required for align mode)")
    p.add_argument("--words", help="cached <out>.words.json (required for regroup mode)")
    p.add_argument("--model", default="large-v3", help="whisper model size")
    p.add_argument("--language", default="en")
    p.add_argument("--lines-per-screen", type=int, default=LINES_PER_SCREEN)
    p.add_argument("-o", "--out", default="screens.json")
    p.add_argument("--srt", help="also write an SRT file here")
    args = p.parse_args()
    LINES_PER_SCREEN = args.lines_per_screen

    if args.mode == "regroup":
        if not args.words:
            p.error("regroup mode needs --words <out>.words.json")
        with open(args.words, encoding="utf-8") as f:
            cached = json.load(f)
        words = cached["words"]
        audio_label = cached.get("audio", args.words)
    else:
        if args.mode == "align":
            if not args.audio or not args.text:
                p.error("align mode needs <audio> and --text")
            with open(args.text, encoding="utf-8") as f:
                transcript = f.read()
            words = words_from_align(args.audio, transcript, args.language)
        else:
            if not args.audio:
                p.error("transcribe mode needs <audio>")
            words = words_from_transcribe(args.audio, args.model, args.language)
        audio_label = args.audio

        if not words:
            print("No words produced — check the audio file.", file=sys.stderr)
            return 1

        # Cache raw word-level timing alongside the screens output. Regrouping
        # into a different LINES_PER_SCREEN later (as happened once already)
        # is then instant -- it doesn't require re-running alignment, which is
        # the expensive part.
        words_path = args.out.rsplit(".", 1)[0] + ".words.json"
        with open(words_path, "w", encoding="utf-8") as f:
            json.dump({"audio": audio_label, "words": words}, f, ensure_ascii=False)
        print(f"cached words -> {words_path}")

    screens = lines_to_screens(words_to_lines(words))

    payload = {"audio": audio_label, "screens": screens}
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    print(f"{len(screens)} screens -> {args.out}")

    if args.srt:
        with open(args.srt, "w", encoding="utf-8") as f:
            for s in screens:
                f.write(f"{s['index'] + 1}\n")
                f.write(f"{_ts(s['start'])} --> {_ts(s['end'])}\n")
                f.write("\n".join(s["lines"]) + "\n\n")
        print(f"subtitles -> {args.srt}")

    return 0


def _ts(sec):
    ms = int(round(sec * 1000))
    h, ms = divmod(ms, 3600000)
    m, ms = divmod(ms, 60000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


if __name__ == "__main__":
    sys.exit(main())
