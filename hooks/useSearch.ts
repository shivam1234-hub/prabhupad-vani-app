import { useMemo, useState } from 'react';
import lecturesData from '../data/lectures.json';
import extraData from '../data/extra-recordings.json';
import { Recording, getRecordingId, getTypeMeta } from '../data/types';
import { useLibrary } from '../contexts/LibraryContext';

const allRecordings: Recording[] = [
  ...(lecturesData as Recording[]),
  ...(extraData as Recording[]),
];

export type SortBy = 'date' | 'name-asc' | 'name-desc' | 'sequence';

export interface SearchFilters {
  query: string;
  types: string[];
  onlyFavourites: boolean;
  tags: string[];
  yearFrom: number | null;
  yearTo: number | null;
  location: string;
  sortBy: SortBy;
}

export const DEFAULT_SEARCH_FILTERS: SearchFilters = {
  query: '',
  types: [],
  onlyFavourites: false,
  tags: [],
  yearFrom: null,
  yearTo: null,
  location: '',
  sortBy: 'date',
};

function extractSequence(title: string): [number, number, number] {
  const m = title.match(/(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!m) return [999, 0, 0];
  return [parseInt(m[1], 10), parseInt(m[2], 10), m[3] ? parseInt(m[3], 10) : 0];
}

export function sortRecordings(list: Recording[], sortBy: SortBy): Recording[] {
  const copy = [...list];
  switch (sortBy) {
    case 'name-asc':
      return copy.sort((a, b) => a.title.localeCompare(b.title));
    case 'name-desc':
      return copy.sort((a, b) => b.title.localeCompare(a.title));
    case 'sequence': {
      return copy.sort((a, b) => {
        const sa = extractSequence(a.title);
        const sb = extractSequence(b.title);
        for (let i = 0; i < 3; i++) {
          if (sa[i] !== sb[i]) return sa[i] - sb[i];
        }
        return a.title.localeCompare(b.title);
      });
    }
    default:
      return copy.sort((a, b) => {
        if (a.date < b.date) return -1;
        if (a.date > b.date) return 1;
        return 0;
      });
  }
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function words(s: string): string[] {
  return s.split(/[^a-z0-9]+/).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Verse-reference aware matching
//
// Lecture titles encode a scripture verse in a zero-padded, sometimes-ranged
// form: "SB 01.02.03", "BG 02.07-11", "CC Madhya 20.66-96". Users type the
// natural, un-padded form ("sb 1.2.3", "cc madhya lila 17.186") and expect
// exact hits first, then verses that fall inside a lecture's range, then
// nearby verses in the same chapter. Plain substring matching fails on all of
// these (padding, ranges, the word "lila" living only in the folder path), so
// we parse both the query and each record into a structured verse reference
// and score by numeric proximity.
// ---------------------------------------------------------------------------

// query word -> canonical book badge (lowercased). Covers the main scriptures.
const BOOK_ALIASES: Record<string, string> = {
  sb: 'sb', srimad: 'sb', bhagavatam: 'sb', bhagavata: 'sb', bhagwatam: 'sb', bhagavatan: 'sb',
  bg: 'bg', gita: 'bg', geeta: 'bg', bhagavad: 'bg', bhagwad: 'bg', bhagvad: 'bg',
  cc: 'cc', caitanya: 'cc', chaitanya: 'cc', caritamrta: 'cc', caritamrita: 'cc', charitamrita: 'cc',
  nod: 'nod', iso: 'iso', isopanisad: 'iso', ishopanishad: 'iso',
  bs: 'bs', brahma: 'bs', samhita: 'bs',
};
const LILA_WORDS: Record<string, string> = { adi: 'adi', madhya: 'madhya', antya: 'antya' };
// Words that carry no verse meaning and should be ignored when matching.
const NOISE_WORDS = new Set(['lila', 'lilas', 'lecture', 'verse', 'verses', 'text', 'texts', 'ch', 'chapter', 'canto']);

// Recording titles/locations never contain these character or setting names
// (they're just "BG 02.07-11 — New York"), so a plain-text search for them
// would otherwise come back empty even though the query unambiguously points
// at one scripture. Nudge those specific queries toward the right badge.
const THEME_TO_BADGE: Record<string, string> = {
  arjuna: 'bg', kuruksetra: 'bg', kurukshetra: 'bg', duryodhana: 'bg',
  pariksit: 'sb', parikshit: 'sb', pariksit_maharaja: 'sb', sukadeva: 'sb', shukadeva: 'sb',
};

const NUM_BLOCK = /(\d+(?:\.\d+)*)(?:\s*[-–,]\s*(\d+(?:\.\d+)*))?/;

interface VerseNums { base: number[]; end: number | null }

// Extract the first "N.N.N" (optionally "-M" ranged) block from a string.
function parseNumbers(s: string): VerseNums | null {
  const m = s.match(NUM_BLOCK);
  if (!m) return null;
  const base = m[1].split('.').map(x => parseInt(x, 10));
  let end: number | null = null;
  if (m[2]) {
    const parts = m[2].split('.');
    end = parseInt(parts[parts.length - 1], 10);
  }
  return { base, end };
}

interface ParsedQuery {
  book: string | null;
  lila: string | null;
  nums: VerseNums | null;
  leftover: string[];   // non-verse text tokens that must still match
  verseMode: boolean;
}

function parseQuery(tokens: string[]): ParsedQuery {
  let book: string | null = null;
  let lila: string | null = null;
  let nums: VerseNums | null = null;
  let dotted = false;
  const leftover: string[] = [];

  for (const t of tokens) {
    const isNumeric = /^[\d.\-–,]+$/.test(t) && /\d/.test(t);
    if (isNumeric) {
      if (/\d[.\-–]\d/.test(t)) dotted = true;
      if (nums === null) nums = parseNumbers(t);
      continue;
    }
    if (BOOK_ALIASES[t]) { book = BOOK_ALIASES[t]; continue; }
    if (LILA_WORDS[t]) { lila = LILA_WORDS[t]; continue; }
    if (NOISE_WORDS.has(t)) continue;
    leftover.push(t);
  }

  // Only treat as a verse lookup when there's a dotted reference (1.2.3) or a
  // book was named alongside a number ("sb 12"). A bare "1972" stays text.
  const verseMode = nums !== null && (dotted || book !== null);
  return { book, lila, nums, leftover, verseMode };
}

// Numeric proximity between a query reference and a record reference.
// 1000 exact · 950 inside range · 850 query-is-prefix · nearby-verse decays
// from 800 · 0 when they diverge above the verse level (different chapter).
function verseScore(q: number[], r: number[], rEnd: number | null): number {
  const n = Math.min(q.length, r.length);
  let i = 0;
  while (i < n && q[i] === r[i]) i++;

  if (i === n) {
    if (q.length === r.length) return 1000;   // exact
    if (q.length < r.length) return 850;       // query less specific (prefix)
    return 600;                                 // query more specific than record
  }
  // They differ at index i; everything before i is equal.
  // If the only divergence is the final (verse) component, it's the same
  // chapter — reward closeness, and treat the record's range as a hit.
  if (i === n - 1 && q.length === r.length) {
    const lo = r[i];
    const hi = rEnd ?? r[i];
    if (q[i] >= lo && q[i] <= hi) return 950;   // inside the lecture's verse range
    const dist = Math.min(Math.abs(q[i] - lo), Math.abs(q[i] - hi));
    return Math.max(500, 800 - dist);           // nearby verse, same chapter
  }
  return 0;   // different canto/chapter — not "nearby"
}

// ---------------------------------------------------------------------------
// Fuzzy, "Google-like" free-text matching
//
// Plain substring matching only finds queries the user spelled exactly like
// the record. Real searches have typos, partial words, and words typed in a
// different order than the title — this layer tolerates all three:
//   - exact / prefix / substring word matches score highest
//   - small typos (1-3 edits, scaled to word length) still score, via
//     Levenshtein distance, so "vrndavan"/"vrindavan"/"vrndaban" all match
//   - a query doesn't have to match every token to show up at all — partial
//     coverage still ranks (lower) rather than being excluded outright,
//     mirroring how Google keeps showing results for close-but-imperfect
//     queries instead of a bare "no results".
// ---------------------------------------------------------------------------

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    const curr = new Array(b.length + 1);
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,        // deletion
        curr[j - 1] + 1,    // insertion
        prev[j - 1] + cost, // substitution
      );
    }
    prev = curr;
  }
  return prev[b.length];
}

// Best match of `token` against a single `word`, 0-100.
function fuzzyWordScore(token: string, word: string): number {
  if (!word) return 0;
  if (word === token) return 100;
  if (word.startsWith(token)) return 92;
  if (token.length >= 3 && word.startsWith(token.slice(0, token.length - 1))) return 84;
  if (word.includes(token)) return 78;
  if (token.length >= 3) {
    const dist = levenshtein(token, word);
    const maxLen = Math.max(token.length, word.length);
    const allowed = token.length <= 4 ? 1 : token.length <= 7 ? 2 : 3;
    if (dist <= allowed) {
      const similarity = 1 - dist / maxLen;
      return Math.round(35 + similarity * 40); // 35-75, typo-tolerant band
    }
  }
  return 0;
}

// Best match of `token` against a whole field's word list, 0-100.
function fuzzyFieldScore(token: string, fieldWords: string[]): number {
  let best = 0;
  for (const w of fieldWords) {
    const s = fuzzyWordScore(token, w);
    if (s > best) best = s;
    if (best === 100) break;
  }
  return best;
}

interface SearchIndexEntry {
  recording: Recording;
  nTitle: string;
  nChapter: string;
  nFull: string;
  nFolder: string;
  nLocation: string;
  nBadge: string;
  nTypeLabel: string;
  nYear: string;
  titleWords: string[];
  chapterWords: string[];
  fullWords: string[];
  folderWords: string[];
  locationWords: string[];
  noSpace: string; // title+full+location with all separators stripped — catches "newyork", "losangeles"
  rNums: VerseNums | null;
  badge: string;
  lila: string | null;
}

// Built once at module load — normalizing ~4000 records per keystroke was
// the main reason search felt sluggish and stale; do it a single time here.
const SEARCH_INDEX: SearchIndexEntry[] = allRecordings.map((r) => {
  const meta = getTypeMeta(r.type);
  const nTitle = normalize(r.title);
  const nChapter = normalize(r.chapter ?? '');
  const nFull = normalize(r.fullTitle);
  const nFolder = normalize(r.folder ?? '');
  const nLocation = normalize(r.location);
  const lilaMatch = nTitle.match(/\b(adi|madhya|antya)\b/);
  return {
    recording: r,
    nTitle,
    nChapter,
    nFull,
    nFolder,
    nLocation,
    nBadge: normalize(meta.badge),
    nTypeLabel: normalize(meta.label),
    nYear: String(r.year),
    titleWords: words(nTitle),
    chapterWords: words(nChapter),
    fullWords: words(nFull),
    folderWords: words(nFolder),
    locationWords: words(nLocation),
    noSpace: (nTitle + nFull + nLocation).replace(/[^a-z0-9]/g, ''),
    rNums: parseNumbers(r.title),
    badge: normalize(meta.badge),
    lila: lilaMatch ? lilaMatch[1] : null,
  };
});

// Field weight (0-100) — how much a match in this field should count.
const FIELD_WEIGHTS: Array<{ words: keyof SearchIndexEntry; whole: keyof SearchIndexEntry; weight: number }> = [
  { words: 'titleWords', whole: 'nTitle', weight: 100 },
  { words: 'chapterWords', whole: 'nChapter', weight: 90 },
  { words: 'fullWords', whole: 'nFull', weight: 62 },
  { words: 'folderWords', whole: 'nFolder', weight: 58 },
  { words: 'locationWords', whole: 'nLocation', weight: 45 },
];

// Score a single query token against every field of a record, returning the
// best weighted contribution (0-100).
function tokenScore(entry: SearchIndexEntry, token: string): number {
  let best = 0;
  for (const { words: wKey, weight } of FIELD_WEIGHTS) {
    const fieldWords = entry[wKey] as string[];
    const s = fuzzyFieldScore(token, fieldWords) * (weight / 100);
    if (s > best) best = s;
  }
  // Badge ("bg"/"sb") and type label and year: exact/substring only — these
  // are short codes where fuzzy edit-distance would create false positives.
  if (entry.nBadge.includes(token) || entry.nTypeLabel.includes(token)) {
    best = Math.max(best, 40);
  }
  if (token.length >= 2 && entry.nYear.includes(token)) {
    best = Math.max(best, 32);
  }
  // Character/place names that don't literally appear in any field but
  // unambiguously belong to one scripture (e.g. "arjuna" -> Bhagavad-gita).
  if (THEME_TO_BADGE[token] === entry.badge) {
    best = Math.max(best, 55);
  }
  return best;
}

function scoreRecording(entry: SearchIndexEntry, nq: string): number {
  const tokens = nq.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 0;

  // Verse-reference lookup (e.g. "sb 1.2.3", "cc madhya lila 17.186").
  const pq = parseQuery(tokens);
  if (pq.verseMode && pq.nums) {
    const rNums = entry.rNums;
    if (!rNums) return 0;
    if (pq.book && entry.badge !== pq.book) return 0;
    if (pq.lila && entry.lila !== pq.lila) return 0;

    const vs = verseScore(pq.nums.base, rNums.base, rNums.end);
    if (vs === 0) return 0;

    // Any remaining plain-text words (e.g. "sb krsna 1.2.3") must still be a
    // reasonable (typo-tolerant) match somewhere.
    if (pq.leftover.length > 0) {
      const ok = pq.leftover.every((t) => tokenScore(entry, t) >= 35);
      if (!ok) return 0;
    }
    return vs;
  }

  // Exact phrase hit — the whole query appears verbatim in the title.
  if (entry.nTitle.startsWith(nq)) return 100;
  if (entry.nTitle.includes(nq)) return 96;
  if (entry.nFull.includes(nq)) return 90;

  // Query typed with no spaces ("newyork", "losangeles") — compare against
  // fields with their own separators stripped too.
  if (tokens.length === 1 && tokens[0].length >= 5) {
    const flat = tokens[0].replace(/[^a-z0-9]/g, '');
    if (entry.noSpace.includes(flat)) return 82;
  }

  let sum = 0;
  let matched = 0;
  for (const t of tokens) {
    const s = tokenScore(entry, t);
    sum += s;
    if (s > 0) matched++;
  }
  if (matched === 0) return 0;

  const avg = sum / tokens.length;
  const coverage = matched / tokens.length;
  // Full coverage keeps the raw average; partial coverage is discounted so
  // "krsna arjuna" (2/2) outranks a record only "krsna" happens to touch.
  return avg * (0.5 + 0.5 * coverage);
}

export function useSearch(): {
  results: Recording[];
  filters: SearchFilters;
  setFilters: React.Dispatch<React.SetStateAction<SearchFilters>>;
  totalCount: number;
  activeFilterCount: number;
  locations: string[];
  years: number[];
  reset: () => void;
} {
  const [filters, setFilters] = useState<SearchFilters>(DEFAULT_SEARCH_FILTERS);
  const { isFavourite, getTagsFor } = useLibrary();

  const locations = useMemo<string[]>(() => {
    const set = new Set<string>();
    for (const r of allRecordings) {
      if (r.location) set.add(r.location);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, []);

  const years = useMemo<number[]>(() => {
    const set = new Set<number>();
    for (const r of allRecordings) {
      if (r.year) set.add(r.year);
    }
    return [...set].sort((a, b) => a - b);
  }, []);

  const results = useMemo<Recording[]>(() => {
    const { query, types, onlyFavourites, tags, yearFrom, yearTo, location, sortBy } = filters;
    const nq = normalize(query.trim());
    const hasQuery = nq.length > 0;
    const nLocation = normalize(location.trim());
    // Below this, a match is more noise than signal — filters it out entirely
    // rather than showing an unrelated "closest" record.
    const MIN_SCORE = 18;

    let candidates: Array<{ recording: Recording; score: number }>;

    if (hasQuery && sortBy === 'date') {
      candidates = [];
      for (const entry of SEARCH_INDEX) {
        const score = scoreRecording(entry, nq);
        if (score >= MIN_SCORE) candidates.push({ recording: entry.recording, score });
      }
      candidates.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (a.recording.date < b.recording.date) return -1;
        if (a.recording.date > b.recording.date) return 1;
        return 0;
      });
    } else if (hasQuery) {
      candidates = [];
      for (const entry of SEARCH_INDEX) {
        const score = scoreRecording(entry, nq);
        if (score >= MIN_SCORE) candidates.push({ recording: entry.recording, score });
      }
      candidates.sort((a, b) => b.score - a.score);
      const sorted = sortRecordings(candidates.map(c => c.recording), sortBy);
      candidates = sorted.map(r => ({ recording: r, score: 0 }));
    } else {
      const sorted = sortRecordings(allRecordings, sortBy);
      candidates = sorted.map(r => ({ recording: r, score: 0 }));
    }

    const filtered: Recording[] = [];
    const limit = hasQuery ? 200 : 100;

    for (const { recording: r } of candidates) {
      if (filtered.length >= limit) break;

      if (types.length > 0 && !types.includes(r.type)) continue;

      const id = getRecordingId(r);

      if (onlyFavourites && !isFavourite(id)) continue;

      if (tags.length > 0) {
        const rTags = getTagsFor(id);
        if (!tags.every((t) => rTags.includes(t))) continue;
      }

      if (yearFrom !== null && r.year < yearFrom) continue;
      if (yearTo !== null && r.year > yearTo) continue;

      if (nLocation && !normalize(r.location).includes(nLocation)) continue;

      filtered.push(r);
    }

    return filtered;
  }, [filters, isFavourite, getTagsFor]);

  const activeFilterCount = useMemo<number>(() => {
    let count = 0;
    if (filters.types.length > 0) count++;
    if (filters.onlyFavourites !== DEFAULT_SEARCH_FILTERS.onlyFavourites) count++;
    if (filters.tags.length > 0) count++;
    if (filters.yearFrom !== null) count++;
    if (filters.yearTo !== null) count++;
    if (filters.location !== DEFAULT_SEARCH_FILTERS.location) count++;
    return count;
  }, [filters]);

  const reset = () => setFilters(DEFAULT_SEARCH_FILTERS);

  return {
    results,
    filters,
    setFilters,
    totalCount: allRecordings.length,
    activeFilterCount,
    locations,
    years,
    reset,
  };
}
