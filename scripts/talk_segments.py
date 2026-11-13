#!/usr/bin/env python3
"""
"Prabhupāda only" segments for one lecture.

Input:  the lecture's vanisource wikitext (fetched) plus, for each audio part,
        the forced-alignment cache data/screens/<id>/part-N.words.json written
        by lecture_to_screens.py (one entry per transcript word, in order).
Output: data/talk/<id>.json
        { "parts": { "0": [[start, end], ...] }, "talkSec": n, "totalSec": n }
        — the time ranges to KEEP. Everything else (śloka chanting, synonyms
        and translation read by a devotee, devotees speaking, kirtan, long
        silences) is skipped by the app's "Prabhupāda only" mode.

How a word is classed: the wikitext marks every paragraph's speaker in bold
('''Prabhupāda:''', '''Pradyumna:''', '''Devotee:'''), verse lines start with
':', synonym lists are full of "—", and the translation paragraph starts
"Translation:". Paragraph words are matched to the aligned words with
difflib, so each timed word inherits its paragraph's class. Audio with no
words at all (kirtan, music, pauses) is never inside a kept range, because
ranges are built from word timings.

    python3 -I scripts/talk_segments.py <recordingId> <vanisourceUrl>
"""
import difflib
import json
import os
import re
import sys
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

LONG_GAP = 20.0      # a wordless stretch this long inside talk = kirtan/music/break: skip it
MIN_KEEP = 4.0       # drop isolated kept runs shorter than this (s)
PAD = 0.25           # small lead-in/out so words are not clipped

_TOKEN_RE = re.compile(r"[\w']+", re.UNICODE)
LABEL_RE = re.compile(r"^'''([^':][^']{0,40}?):\s*'''\s*(.*)$", re.S)


def norm(w):
    return "".join(_TOKEN_RE.findall(w.lower()))


def fetch_wikitext(url):
    title = url.split("/wiki/")[1]
    api = ("https://vanisource.org/w/api.php?action=parse&prop=wikitext&format=json&page="
           + urllib.parse.quote(urllib.parse.unquote(title), safe=""))
    req = urllib.request.Request(api, headers={"User-Agent": "PrabhupadaVaniApp/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)["parse"]["wikitext"]["*"]


def clean(text):
    text = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", text)   # [[link|label]]
    text = re.sub(r"<[^>]+>", " ", text)
    text = text.replace("'''", "").replace("''", "")
    return text


def is_prabhupada(label):
    l = label.lower()
    return l.startswith("prabhup") or l.startswith("śrīla prabhup") or l.startswith("srila prabhup")


def classify_paragraphs(wikitext):
    """[(class, [normalised words])] in transcript order. class: talk | skip."""
    start = wikitext.find("</mp3player>")
    body = wikitext[start + len("</mp3player>"):] if start >= 0 else wikitext
    body = re.split(r"\n==+[^=]", body)[0]          # stop at a following section
    out = []
    speaker = None
    for para in re.split(r"\n\s*\n", body):
        p = para.strip()
        if not p or p.startswith("{{") or p.startswith("[[Category") or p.startswith("<div"):
            continue
        m = LABEL_RE.match(p)
        if m:
            speaker, p = m.group(1).strip(), m.group(2).strip()
            if not p:
                continue
        text = clean(p)
        words = [norm(w) for w in text.split()]
        words = [w for w in words if w]
        if not words:
            continue
        verse = all(line.strip().startswith(":") for line in p.splitlines() if line.strip())
        synonyms = p.count("—") >= 3
        translation = text.lstrip().lower().startswith("translation")
        marker_only = re.fullmatch(r"\(([^)]*)\)\s*", text.strip()) is not None
        keep = (speaker is None or is_prabhupada(speaker)) and not (verse or synonyms or translation or marker_only)
        # Before anyone is labelled, the opening is almost always the verse
        # chanting; only trust unlabelled text once Prabhupāda has spoken.
        if speaker is None:
            keep = False
        out.append(("talk" if keep else "skip", words))
    return out


def keep_ranges(words, classes, paras):
    """A kept range runs until a non-talk word appears or the audio goes
    wordless for LONG_GAP seconds between two paragraphs. Prabhupāda's own
    pauses stay inside. A long gap in the middle of one paragraph is the
    aligner losing track on a poor recording (the words are still being
    spoken), never kirtan or a reading, so it never breaks a range."""
    ranges = []
    open_run = False
    last_para = None
    for w, c, pi in zip(words, classes, paras):
        if c != "talk":
            open_run = False
            continue
        s, e = float(w["start"]), float(w["end"])
        if open_run and (s - ranges[-1][1] <= LONG_GAP or pi == last_para):
            ranges[-1][1] = max(ranges[-1][1], e)
        else:
            ranges.append([s, e])
            open_run = True
        last_para = pi
    ranges = [r for r in ranges if r[1] - r[0] >= MIN_KEEP]
    return [[round(max(0, r[0] - PAD), 2), round(r[1] + PAD, 2)] for r in ranges]


def main():
    rec_id, url = sys.argv[1], sys.argv[2]
    paras = classify_paragraphs(fetch_wikitext(url))
    para_words, para_cls, para_idx = [], [], []
    for n, (cls, ws) in enumerate(paras):
        para_words += ws
        para_cls += [cls] * len(ws)
        para_idx += [n] * len(ws)

    # Alignment cache: data/screens by default (lectures that also have
    # presentation-mode slides); the full-library batch keeps it outside the
    # app (ALIGN_DIR) so thousands of slide files never reach the bundle.
    screens = os.path.join(os.environ.get("ALIGN_DIR", os.path.join(ROOT, "data", "screens")), rec_id)
    parts, talk, total = {}, 0.0, 0.0
    for f in sorted(os.listdir(screens)):
        m = re.fullmatch(r"part-(\d+)\.words\.json", f)
        if not m:
            continue
        words = json.load(open(os.path.join(screens, f)))["words"]
        wn = [norm(w["word"]) for w in words]
        classes = ["skip"] * len(words)
        pidx = [-1] * len(words)
        sm = difflib.SequenceMatcher(None, wn, para_words, autojunk=False)
        for b in sm.get_matching_blocks():
            for k in range(b.size):
                classes[b.a + k] = para_cls[b.b + k]
                pidx[b.a + k] = para_idx[b.b + k]
        # Unmatched words take the class of the nearest matched neighbour on
        # the left (they sit inside the same paragraph almost always).
        last, last_p = "skip", -1
        matched = set()
        for b in sm.get_matching_blocks():
            matched.update(range(b.a, b.a + b.size))
        for i in range(len(classes)):
            if i in matched:
                last, last_p = classes[i], pidx[i]
            else:
                classes[i], pidx[i] = last, last_p
        r = keep_ranges(words, classes, pidx)
        parts[m.group(1)] = r
        talk += sum(e - s for s, e in r)
        total += float(words[-1]["end"]) if words else 0

    os.makedirs(os.path.join(ROOT, "data", "talk"), exist_ok=True)
    out = {"parts": parts, "talkSec": round(talk), "totalSec": round(total)}
    json.dump(out, open(os.path.join(ROOT, "data", "talk", f"{rec_id}.json"), "w"), separators=(",", ":"))
    print(f"{rec_id}: talk {talk/60:.1f} of {total/60:.1f} min, {sum(len(v) for v in parts.values())} ranges")


if __name__ == "__main__":
    main()
