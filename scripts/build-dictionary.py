#!/usr/bin/env python3
"""
Build the offline English dictionary used by the tap-a-word lookup.

Source: Princeton WordNet 3.0 via NLTK (`nltk.download('wordnet')`), which is
free to redistribute under the WordNet licence (kept in the output header).

Output: assets/dictionary/wordnet.dict -- plain text, one headword per line,
sorted, so the app can load it with a single file read and no JSON parse:

    word<TAB>pos:definition<US>pos:definition...
    form<TAB>@base:pos        (irregular inflection -> headword redirect)

where <US> is \\x1f. Only single-word lemmas are kept (you can't tap a phrase),
and at most MAX_SENSES senses per part of speech -- the long tail of WordNet
senses is what makes the full database 30 MB, and nobody reads the ninth
meaning of "run" in a popup.

Regular inflections (-s, -ed, -ing, ...) are *not* expanded here; the app
strips them at lookup time with WordNet's own morphy rules
(utils/dictionary.ts). Only the irregular exception lists are baked in.

Usage:  .venv/bin/python3 scripts/build-dictionary.py
"""
import os
import re
from nltk.corpus import wordnet as wn

MAX_SENSES = 3
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'dictionary', 'wordnet.dict')
POS_TAG = {'n': 'n', 'v': 'v', 'a': 'a', 's': 'a', 'r': 'r'}
POS_ORDER = ['n', 'v', 'a', 'r']
US = '\x1f'
WORD_RE = re.compile(r"^[a-z][a-z'-]*$")


RELIGION_TAG_RE = re.compile(r'^\((Hinduism|Hindu mythology|Buddhism|Jainism|Sanskrit)\b')
ATTRIBUTION_RE = re.compile(r"\s*;?\s*-\s*[A-Z][A-Za-z.']+(?:\s+[A-Z][A-Za-z.']+)*\s*$")


def clean(text):
    text = ' '.join(text.replace('\t', ' ').replace(US, ' ').split())
    # A few glosses end in a quote attribution ("...; -Aldous Huxley").
    return ATTRIBUTION_RE.sub('', text)


def main():
    entries = {}
    for lemma in wn.all_lemma_names():
        if not WORD_RE.match(lemma):
            continue
        senses = []
        for pos in POS_ORDER:
            seen = set()
            count = 0
            for syn in wn.synsets(lemma, pos=pos):
                if count >= MAX_SENSES:
                    break
                d = clean(syn.definition())
                if not d or d in seen:
                    continue
                # Sanskrit/Vedic terms are explained only by the Sanskrit
                # glossary (data/sanskritGlossary.ts), in Srila Prabhupada's
                # sense -- never by a secular dictionary's "Hinduism" gloss.
                if RELIGION_TAG_RE.match(d):
                    continue
                seen.add(d)
                count += 1
                senses.append(f'{POS_TAG[syn.pos()]}:{d}')
        if senses:
            entries[lemma] = US.join(senses)

    # Irregular forms ("went" -> "go", "children" -> "child") from WordNet's
    # exception lists, only where the form isn't already a headword itself.
    redirects = {}
    for pos in POS_ORDER:
        for form, bases in wn._exception_map[pos].items():
            if form in entries or form in redirects or not WORD_RE.match(form):
                continue
            base = next((b for b in bases if b in entries), None)
            if base and base != form:
                redirects[form] = (base, pos)

    lines = [f'{w}\t{entries[w]}' for w in entries]
    lines += [f'{f}\t@{b}:{p}' for f, (b, p) in redirects.items()]
    lines.sort(key=lambda l: l.split("\t", 1)[0])

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    header = ('# WordNet 3.0 Copyright 2006 by Princeton University. All rights reserved. '
              'Licence: https://wordnet.princeton.edu/license-and-commercial-use\n')
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write(header)
        f.write('\n'.join(lines))
        f.write('\n')
    print(f'{len(entries)} headwords + {len(redirects)} redirects -> {OUT} '
          f'({os.path.getsize(OUT) / 1e6:.1f} MB)')


if __name__ == '__main__':
    main()
