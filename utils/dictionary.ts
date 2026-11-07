import { loadDictionaryText, DictionaryName } from './dictionaryLoader';
import { lookupGlossary, GlossaryEntry } from '../data/sanskritGlossary';

/**
 * Offline word lookup for the transcript's long-press / double-click meanings.
 *
 * English words: the bundled WordNet 3.0 file (scripts/build-dictionary.py),
 * a sorted `word<TAB>senses` text kept as one string plus an Int32Array of
 * line offsets and binary-searched — splitting 86k lines into a Map would cost
 * tens of MB of JS objects on a phone.
 *
 * Sanskrit words: only the glossary in data/sanskritGlossary.ts, in Śrīla
 * Prabhupāda's sense. No secular Sanskrit or English dictionary is consulted
 * for them — the user asked for meanings to stay bona fide — so an unknown
 * Sanskrit word shows "not found" plus a link to sanskritdictionary.org
 * (Prabhupāda's own word-for-word translations) rather than a guess.
 */

export type PartOfSpeech = 'n' | 'v' | 'a' | 'r';

export interface Sense {
  pos: PartOfSpeech;
  def: string;
}

/** Meaning of one piece of a hyphenated compound ("vāñchā-kalpatarubhyaś"). */
export interface PartResult {
  word: string;
  glossary: GlossaryEntry | null;
}

export interface LookupResult {
  /** The word as the reader selected it, trimmed of punctuation. */
  word: string;
  /** English headword it resolved to ("went" -> "go"), or null. */
  headword: string | null;
  senses: Sense[];
  glossary: GlossaryEntry | null;
  /** The glossary entry was reached by stripping a Sanskrit case ending
   * ("vaiṣṇavebhyo" -> Vaiṣṇava). */
  glossaryViaStem: boolean;
  /** Read as Sanskrit (diacritics, or from a verse line) — English is never
   * shown for it, and a miss offers the online Prabhupāda dictionary. */
  isSanskrit: boolean;
  /** Filled only when the whole compound had no entry of its own. */
  parts: PartResult[];
}

export const POS_LABEL: Record<PartOfSpeech, string> = {
  n: 'noun', v: 'verb', a: 'adjective', r: 'adverb',
};

const SENSE_SEP = '\x1f';

class SortedDictionary {
  private text = '';
  private lineStarts: Int32Array | null = null;
  private loading: Promise<void> | null = null;

  constructor(private readonly name: DictionaryName) {}

  load(): Promise<void> {
    if (!this.loading) {
      this.loading = loadDictionaryText(this.name).then(raw => this.index(raw)).catch(err => {
        this.loading = null; // let the next lookup retry
        throw err;
      });
    }
    return this.loading;
  }

  // 8.6 MB / ~120 k lines: doing this in a single tight loop blocks the JS
  // thread for hundreds of ms on Android, which makes the meaning sheet
  // freeze on-open the first time a word is looked up. Yield to the event
  // loop every ~8 ms so the modal animation and any concurrent scroll
  // gesture keep their frames.
  private async index(raw: string) {
    const starts: number[] = [];
    let pos = 0;
    const len = raw.length;
    const yieldMs = 8;
    let deadline = Date.now() + yieldMs;
    while (pos < len) {
      const nl = raw.indexOf('\n', pos);
      const end = nl === -1 ? len : nl;
      if (end > pos && raw.charCodeAt(pos) !== 35 /* '#' header */) starts.push(pos);
      pos = end + 1;
      if (Date.now() >= deadline) {
        // setTimeout(0) posts to the macrotask queue — enough for RN to flush
        // any pending layout / touch handlers before we grab the thread again.
        await new Promise<void>(res => setTimeout(res, 0));
        deadline = Date.now() + yieldMs;
      }
    }
    this.text = raw;
    this.lineStarts = Int32Array.from(starts);
  }

  /** Senses field for an exact key, or null. */
  find(key: string): string | null {
    const starts = this.lineStarts;
    const text = this.text;
    if (!starts) return null;
    let lo = 0;
    let hi = starts.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const start = starts[mid];
      const tab = text.indexOf('\t', start);
      const k = text.slice(start, tab);
      if (k === key) {
        const nl = text.indexOf('\n', tab);
        return text.slice(tab + 1, nl === -1 ? text.length : nl);
      }
      if (k < key) lo = mid + 1;
      else hi = mid - 1;
    }
    return null;
  }
}

const english = new SortedDictionary('wordnet');

/** Load the dictionary once; later calls share the same promise. */
export function preloadDictionary(): Promise<void> {
  return english.load();
}

/** Lower-case, drop IAST diacritics and curly quotes, keep letters/'/-. */
export function normalizeWord(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’]/g, "'")
    .toLowerCase()
    .replace(/^[^a-z]+|[^a-z]+$/g, '')
    .replace(/'s$/, '');
}

/** Strip surrounding punctuation but keep the reader's own spelling. */
export function cleanDisplayWord(s: string): string {
  return s.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
}

// ── English ───────────────────────────────────────────────────────────────

// WordNet's own "morphy" detachment rules, in its order, plus -ly/-ily for
// adverbs (which WordNet mostly lists under their adjective) and undoubling
// ("stopped" -> "stopp" -> "stop"). The third field is the part of speech the
// suffix implies, so "realized" lists the verb before any adjective sense.
const SUFFIX_RULES: [string, string, PartOfSpeech?][] = [
  ['ies', 'y'], ['ses', 's', 'n'], ['xes', 'x'], ['zes', 'z'], ['ches', 'ch'], ['shes', 'sh'],
  ['men', 'man', 'n'], ['es', 'e'], ['es', ''], ['s', ''],
  ['ed', 'e', 'v'], ['ed', '', 'v'], ['ing', 'e', 'v'], ['ing', '', 'v'],
  ['est', 'e', 'a'], ['est', '', 'a'], ['er', 'e', 'a'], ['er', '', 'a'],
  ['ily', 'y', 'r'], ['ly', '', 'r'],
];

function englishCandidates(w: string): { key: string; pos?: PartOfSpeech }[] {
  // The exact form comes first, but still carries the suffix's part of speech:
  // WordNet lists "running" as a headword whose first sense is a football play.
  const implied = SUFFIX_RULES.find(([suffix, , pos]) => pos && w.length > suffix.length + 1 && w.endsWith(suffix));
  const out: { key: string; pos?: PartOfSpeech }[] = [{ key: w, pos: implied?.[2] }];
  for (const [suffix, repl, pos] of SUFFIX_RULES) {
    if (w.length > suffix.length + 1 && w.endsWith(suffix)) {
      const base = w.slice(0, -suffix.length) + repl;
      out.push({ key: base, pos });
      if (!repl && /([b-df-hj-np-tv-z])\1$/.test(base)) out.push({ key: base.slice(0, -1), pos });
    }
  }
  if (w.includes('-')) out.push({ key: w.replace(/-/g, '') });
  return out;
}

function resolveEnglish(key: string): { headword: string; raw: string; pos?: PartOfSpeech } | null {
  const raw = english.find(key);
  if (raw == null) return null;
  if (raw.startsWith('@')) {
    // Irregular form: "@go:v" — the part of speech says which meanings of the
    // base apply ("went" is the verb go, not the noun).
    const [base, pos] = raw.slice(1).split(':');
    const target = english.find(base);
    return target && !target.startsWith('@')
      ? { headword: base, raw: target, pos: pos as PartOfSpeech }
      : null;
  }
  return { headword: key, raw };
}

function parseSenses(raw: string, preferPos?: PartOfSpeech): Sense[] {
  const senses = raw.split(SENSE_SEP).map(s => ({ pos: s[0] as PartOfSpeech, def: s.slice(2) }));
  if (!preferPos) return senses;
  // Stable: preferred part of speech first, everything else in WordNet order.
  return [
    ...senses.filter(s => s.pos === preferPos),
    ...senses.filter(s => s.pos !== preferPos),
  ];
}

function lookupEnglish(key: string): { headword: string; senses: Sense[] } | null {
  for (const cand of englishCandidates(key)) {
    const hit = resolveEnglish(cand.key);
    if (hit) return { headword: hit.headword, senses: parseSenses(hit.raw, hit.pos ?? cand.pos) };
  }
  return null;
}

// ── Sanskrit ──────────────────────────────────────────────────────────────

// Case endings (and their sandhi variants — final -ḥ shows up as -ś/-s/-o
// before the next word) to strip back to a glossary term, longest first, each
// with the stem-final letters to try adding back. Keys are already
// diacritic-free, so -ḥ/-ś/-s are all just "h"/"s" here.
const SANSKRIT_ENDINGS: [string, string[]][] = [
  ['ebhyah', ['a']], ['ebhyas', ['a']], ['ebhyo', ['a']], ['abhyam', ['a', '']],
  ['bhyah', ['', 'a']], ['bhyas', ['', 'a']], ['bhyo', ['', 'a']], ['bhyam', ['', 'a']],
  ['ebhih', ['a']], ['ebhis', ['a']], ['bhih', ['', 'a']], ['bhis', ['', 'a']],
  ['anam', ['a', 'an', '']], ['inam', ['i', 'in']], ['unam', ['u']],
  ['asya', ['a']], ['esu', ['a']], ['isu', ['i', 'in']], ['usu', ['u']], ['asu', ['a', 'as']],
  ['aya', ['a']], ['ena', ['a']], ['ina', ['in', 'i']], ['una', ['u']],
  ['aih', ['a']], ['ais', ['a']],
  ['nam', ['', 'n']], ['sya', ['']], ['su', ['']],
  ['ani', ['a', 'an']], ['ini', ['in', 'i']],
  ['ah', ['a', '']], ['as', ['a', '']], ['am', ['a', '']], ['au', ['a', '']],
  ['ih', ['i']], ['is', ['i']], ['uh', ['u']], ['us', ['u']], ['im', ['i']], ['um', ['u']],
  ['e', ['a', 'i', '']], ['o', ['a', 'u', '']],
  ['i', ['in', 'i']], ['a', ['an', 'a', '']],
  ['h', ['']], ['s', ['']], ['m', ['']], ['r', ['']], ['t', ['']], ['n', ['']],
];

/** Glossary entry for a (normalized) word, trying its stems if needed. */
function lookupGlossaryStem(key: string): { entry: GlossaryEntry; viaStem: boolean } | null {
  const forms = key.includes('-') ? [key, key.replace(/-/g, '')] : [key];
  for (const w of forms) {
    const exact = lookupGlossary(w);
    if (exact) return { entry: exact, viaStem: false };
  }
  for (const w of forms) {
    for (const [ending, adds] of SANSKRIT_ENDINGS) {
      if (w.length - ending.length >= 2 && w.endsWith(ending)) {
        const stem = w.slice(0, -ending.length);
        for (const add of adds) {
          const hit = lookupGlossary(stem + add);
          if (hit) return { entry: hit, viaStem: true };
        }
      }
    }
  }
  return null;
}

const DIACRITIC = /[\u0100-\u024f\u1e00-\u1eff]/;

export interface LookupOptions {
  /** The word came from a verse line, so read it as Sanskrit even when it
   * happens to be spelt in plain ASCII ("ca", "eva"). */
  sanskritFirst?: boolean;
}

export async function lookupWord(selected: string, opts: LookupOptions = {}): Promise<LookupResult> {
  const word = cleanDisplayWord(selected.trim().split(/\s+/)[0] ?? '');
  const key = normalizeWord(word);
  const isSanskrit = !!opts.sanskritFirst || DIACRITIC.test(word);
  const result: LookupResult = {
    word, headword: null, senses: [], glossary: null, glossaryViaStem: false, isSanskrit, parts: [],
  };
  if (!key) return result;

  const g = lookupGlossaryStem(key);
  if (g) {
    result.glossary = g.entry;
    result.glossaryViaStem = g.viaStem;
    return result;
  }

  if (!isSanskrit) {
    await preloadDictionary();
    const e = lookupEnglish(key);
    if (e) {
      result.headword = e.headword;
      result.senses = e.senses;
      return result;
    }
  }

  // A hyphenated compound with no entry of its own: explain the pieces the
  // glossary knows.
  if (key.includes('-')) {
    result.parts = word
      .split('-')
      .filter(p => normalizeWord(p))
      .map(p => ({ word: p, glossary: lookupGlossaryStem(normalizeWord(p))?.entry ?? null }));
    if (!result.parts.some(p => p.glossary)) result.parts = [];
  }
  return result;
}
