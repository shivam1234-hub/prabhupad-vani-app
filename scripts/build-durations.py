#!/usr/bin/env python3
"""
Build data/durations.json: { "<vanisourceUrl page title>": seconds } for every
recording in data/lectures.json and data/extra-recordings.json.

No audio is downloaded. For each lecture:
  1. Its mp3 URLs come from the vanisource wikitext (<mp3player> tags),
     fetched 50 pages per API request.
  2. For each mp3: Content-Length, the ID3 tag size (first 10 bytes), and the
     first audio frame (a 4 KB range read). Duration = audio bytes / bitrate,
     or frames from a Xing/VBRI header when the file is VBR.
Multi-part lectures sum their parts.

Re-runnable: results are cached in scripts/.durations-cache.json, so an
interrupted run resumes and a later run only measures new lectures.

    python3 -I scripts/build-durations.py
"""
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, 'scripts', '.durations-cache.json')
OUT = os.path.join(ROOT, 'data', 'durations.json')
UA = {'User-Agent': 'PrabhupadaVaniApp/1.0'}

BITRATES_V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0]
BITRATES_V2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0]
RATES = {3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000]}


def get(url, headers=None, timeout=30, tries=4):
    for t in range(tries):
        try:
            # Some vanipedia mp3 links contain spaces.
            url = urllib.parse.quote(url, safe=':/?&=%')
            req = urllib.request.Request(url, headers={**UA, **(headers or {})})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read(), r.headers
        except Exception:
            if t == tries - 1:
                raise
            time.sleep(1.5 * (t + 1))


def page_title(vanisource_url):
    return urllib.parse.unquote(vanisource_url.split('/wiki/')[1]).replace('_', ' ')


def fetch_mp3_urls(titles):
    """{title: [mp3 urls]} for up to 50 titles."""
    q = urllib.parse.urlencode({
        'action': 'query', 'prop': 'revisions', 'rvprop': 'content', 'rvslots': 'main',
        'format': 'json', 'formatversion': '2', 'redirects': '1', 'titles': '|'.join(titles),
    })
    body, _ = get('https://vanisource.org/w/api.php?' + q)
    d = json.loads(body)
    # Map redirect/normalised names back to what we asked for.
    alias = {}
    for k in ('normalized', 'redirects'):
        for n in d['query'].get(k, []):
            alias[n['to']] = alias.get(n['from'], n['from'])
    out = {}
    for p in d['query']['pages']:
        if 'revisions' not in p:
            continue
        text = p['revisions'][0]['slots']['main']['content']
        urls = [u.strip() for u in re.findall(r'<mp3player>(.*?)</mp3player>', text) if u.strip()]
        out[alias.get(p['title'], p['title'])] = urls
    return out


def mp3_seconds(url):
    head, hh = get(url, {'Range': 'bytes=0-9'})
    total = None
    cr = hh.get('Content-Range')
    if cr and '/' in cr:
        total = int(cr.split('/')[-1])
    off = 0
    if head[:3] == b'ID3':
        off = 10 + ((head[6] << 21) | (head[7] << 14) | (head[8] << 7) | head[9])
    buf, _ = get(url, {'Range': f'bytes={off}-{off + 4095}'})
    i = 0
    while i < len(buf) - 4 and not (buf[i] == 0xFF and (buf[i + 1] & 0xE0) == 0xE0):
        i += 1
    if i >= len(buf) - 4:
        return None
    b1, b2, b3 = buf[i + 1], buf[i + 2], buf[i + 3]
    ver = (b1 >> 3) & 3          # 3 = MPEG1, 2 = MPEG2, 0 = MPEG2.5
    br_idx = (b2 >> 4) & 15
    sr_idx = (b2 >> 2) & 3
    if ver == 1 or sr_idx == 3:
        return None
    bitrate = (BITRATES_V1_L3 if ver == 3 else BITRATES_V2_L3)[br_idx] * 1000
    rate = RATES[ver][sr_idx]
    spf = 1152 if ver == 3 else 576
    mono = ((b3 >> 6) & 3) == 3
    # Xing / Info header (VBR): exact frame count.
    side = (17 if mono else 32) if ver == 3 else (9 if mono else 17)
    x = i + 4 + side
    if buf[x:x + 4] in (b'Xing', b'Info') and buf[x + 7] & 1:
        frames = int.from_bytes(buf[x + 8:x + 12], 'big')
        return frames * spf / rate
    v = i + 4 + 32
    if buf[v:v + 4] == b'VBRI':
        frames = int.from_bytes(buf[v + 14:v + 18], 'big')
        return frames * spf / rate
    if not bitrate or not total:
        return None
    return (total - off - i) * 8 / bitrate


def main():
    recs = []
    for f in ('lectures.json', 'extra-recordings.json'):
        d = json.load(open(os.path.join(ROOT, 'data', f)))
        recs += d if isinstance(d, list) else [x for v in d.values() for x in v]
    titles = sorted({page_title(r['vanisourceUrl']) for r in recs if r.get('vanisourceUrl')})
    cache = json.load(open(CACHE)) if os.path.exists(CACHE) else {'urls': {}, 'mp3': {}}

    todo = [t for t in titles if t not in cache['urls']]
    print(f'{len(titles)} lectures, {len(todo)} need mp3 links', flush=True)
    batches = [todo[i:i + 50] for i in range(0, len(todo), 50)]
    with ThreadPoolExecutor(4) as ex:
        for n, res in enumerate(ex.map(fetch_mp3_urls, batches)):
            for t in batches[n]:
                cache['urls'].setdefault(t, res.get(t, []))
            if n % 10 == 0:
                json.dump(cache, open(CACHE, 'w'))
                print(f'  links {min((n + 1) * 50, len(todo))}/{len(todo)}', flush=True)
    json.dump(cache, open(CACHE, 'w'))

    mp3s = sorted({u for us in cache['urls'].values() for u in us if u not in cache['mp3']})
    print(f'{len(mp3s)} mp3 files to measure', flush=True)

    def measure(u):
        try:
            return u, mp3_seconds(u)
        except Exception:
            return u, None
    with ThreadPoolExecutor(24) as ex:
        for n, (u, s) in enumerate(ex.map(measure, mp3s)):
            if s is not None:
                cache['mp3'][u] = round(s)
            if n % 200 == 0:
                json.dump(cache, open(CACHE, 'w'))
                print(f'  measured {n}/{len(mp3s)}', flush=True)
    json.dump(cache, open(CACHE, 'w'))

    out, missing = {}, 0
    for t in titles:
        urls = cache['urls'].get(t) or []
        secs = [cache['mp3'].get(u) for u in urls]
        if urls and all(s is not None for s in secs):
            out[t.replace(' ', '_')] = sum(secs)
        else:
            missing += 1
    json.dump(out, open(OUT, 'w'), separators=(',', ':'), sort_keys=True)
    print(f'wrote {len(out)} durations, {missing} without audio/unmeasured -> {OUT}')


if __name__ == '__main__':
    sys.exit(main())
