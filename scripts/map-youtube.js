#!/usr/bin/env node
/**
 * Builds data/youtubeMap.json — pvId -> YouTube video(s) — from channels that
 * publish Srila Prabhupada lectures with the spoken words burned onto the
 * screen as slides (the format we surface in-app).
 *
 * No API key needed: a channel's /videos page embeds ytInitialData carrying the
 * videoId, title and duration of each upload, and paging continues through the
 * public innertube `browse` endpoint using the key the page itself ships.
 *
 * Two channels, two title grammars, so two parsers:
 *
 *   spl  "@allsrilaprabhupadalectures" — full lectures, date in every title
 *        "BG 15.15 — Srila Prabhupada Lecture — New Māyāpur, August 5, 1976"
 *        Joins on date (near-unique across 1,412 lectures) + scripture type.
 *
 *   acharya  "@TheAcharya1" — full lectures under thematic titles
 *        "Why Material Knowledge Cannot Reveal Truth | SB 3.25.4 | Mumbai, India | Srila Prabhupada"
 *        Joins on scripture type + verse, with location breaking ties. A verse
 *        reference is required: this channel also posts Morning Walks and Room
 *        Conversations, which carry a date but no verse, and matching those on
 *        date alone pins them onto whichever lecture shares the date.
 *
 * A lecture matched by both channels keeps the date-exact "spl" video as
 * primary and lists the other under `alternates`.
 *
 *   node scripts/map-youtube.js
 *   node scripts/map-youtube.js --only acharya      # one source
 *   node scripts/map-youtube.js --verbose           # print every unmatched title
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const argOf = (flag, dflt) => {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : dflt;
};
const VERBOSE = process.argv.includes('--verbose');
const ONLY = argOf('--only', null);

// --------------------------------------------------------------- page scraping

function walk(node, visit) {
  if (Array.isArray(node)) {
    for (const v of node) walk(v, visit);
  } else if (node && typeof node === 'object') {
    visit(node);
    for (const v of Object.values(node)) walk(v, visit);
  }
}

const durationToSec = (t) => {
  const p = t.split(':').map(Number);
  if (p.some(Number.isNaN)) return null;
  return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2]
    : p.length === 2 ? p[0] * 60 + p[1]
    : null;
};

/** The "HH:MM:SS" badge overlaid on a grid thumbnail. */
function durationOf(lockup) {
  let dur = null;
  walk(lockup.contentImage ?? {}, (n) => {
    const t = n.thumbnailBadgeViewModel?.text;
    if (t && /^[\d:]+$/.test(t)) dur = durationToSec(t);
  });
  return dur;
}

/** Pull {videoId, title, durationSec} rows plus the next continuation token. */
function harvest(data) {
  const videos = [];
  const tokens = [];
  walk(data, (n) => {
    if (n.lockupViewModel) {
      const lv = n.lockupViewModel;
      const title = lv.metadata?.lockupMetadataViewModel?.title?.content ?? '';
      if (lv.contentId && title) {
        videos.push({ videoId: lv.contentId, title, durationSec: durationOf(lv) });
      }
    }
    // Older/alternate renderer, kept as a fallback.
    if (n.richItemRenderer?.content?.videoRenderer) {
      const vr = n.richItemRenderer.content.videoRenderer;
      const title =
        vr.title?.runs?.map((r) => r.text).join('') ?? vr.title?.simpleText ?? '';
      const d = vr.lengthText?.simpleText;
      if (vr.videoId && title) {
        videos.push({
          videoId: vr.videoId,
          title,
          durationSec: d ? durationToSec(d) : null,
        });
      }
    }
    const tok = n.continuationItemRenderer?.continuationEndpoint
      ?.continuationCommand?.token;
    if (tok) tokens.push(tok);
  });
  // A channel page ships several continuations (search box, expandable tabs).
  // The grid's own "load more" token is by far the longest; taking the last one
  // found instead lands on an unrelated tab and returns zero items.
  tokens.sort((a, b) => b.length - a.length);
  return { videos, continuation: tokens[0] ?? null };
}

/** The video grid lives in the selected ("Videos") tab; ignore the other tabs. */
function selectedTabContent(data) {
  const tabs = data.contents?.twoColumnBrowseResultsRenderer?.tabs ?? [];
  const sel = tabs.find((t) => t.tabRenderer?.selected)?.tabRenderer?.content;
  return sel ?? data;
}

async function fetchChannel(handle) {
  const html = await (
    await fetch(`https://www.youtube.com/${handle}/videos`, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'en-US' },
    })
  ).text();

  const initial = html.match(/var ytInitialData = (\{.*?\});<\/script>/s);
  if (!initial) throw new Error(`${handle}: ytInitialData not found — page layout changed`);
  const apiKey = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1];
  const ctx = html.match(/"INNERTUBE_CONTEXT":(\{.*?\}),"INNERTUBE_/s)?.[1];
  if (!apiKey || !ctx) throw new Error(`${handle}: innertube key/context not found`);
  const context = JSON.parse(ctx);

  const all = [];
  const seen = new Set();
  let { videos, continuation } = harvest(selectedTabContent(JSON.parse(initial[1])));
  let page = 1;

  for (;;) {
    const before = all.length;
    for (const v of videos) {
      if (!seen.has(v.videoId)) {
        seen.add(v.videoId);
        all.push(v);
      }
    }
    process.stdout.write(`\r    page ${page}: ${all.length} videos   `);
    // Guard against a continuation that keeps replaying the same page --
    // without this the loop would spin forever on duplicates.
    if (page > 1 && all.length === before) break;
    if (page > 400) break;
    if (!continuation) break;

    const res = await fetch(
      `https://www.youtube.com/youtubei/v1/browse?key=${apiKey}&prettyPrint=false`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
        body: JSON.stringify({ context, continuation }),
      }
    );
    if (!res.ok) {
      process.stdout.write(`\n    paging stopped: HTTP ${res.status}\n`);
      break;
    }
    ({ videos, continuation } = harvest(await res.json()));
    if (!videos.length) break;
    page++;
  }
  process.stdout.write('\n');
  return all;
}

// ------------------------------------------------------------------ title parse

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const isoDate = (monthWord, day, year) => {
  const m = MONTHS[monthWord.slice(0, 3).toLowerCase()];
  if (!m) return null;
  return `${year}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const TYPE_BY_TOKEN = {
  BG: 'Bhagavad-gita',
  SB: 'Srimad-Bhagavatam',
  CC: 'Caitanya-caritamrta',
};

/**
 * Normalize a verse reference to a comparable key.
 *
 *   "3.25.4"      -> "03.25.04"
 *   "2.9.1-8"     -> "02.09.01-08"
 *   "2.1--2.12"   -> "02.01-02.12"
 *
 * The range end matters and must be kept. Our dataset runs whole series on the
 * same opening verse -- Tokyo has SB 02.09.01-7, 01-4, 01-8, 01-9 and 01-12 --
 * so collapsing a range to its first verse makes six distinct lectures
 * indistinguishable and the match is abandoned as ambiguous.
 *
 * Our own `chapter` field pads inconsistently ("02.09.01-7" but "02.09.01-12"),
 * so both sides go through this same function before being compared.
 */
function normalizeVerse(ref) {
  const pad = (seg) =>
    seg.split('.').map((p) => p.trim()).filter(Boolean)
      .map((p) => String(Number(p)).padStart(2, '0')).join('.');

  const [start, ...rest] = ref.split(/--|–|—|-/).map((r) => r.trim()).filter(Boolean);
  if (!start || start.split('.').length < 2) return null;
  const head = pad(start);
  if (!rest.length) return head;
  const tail = pad(rest[rest.length - 1]);
  return tail ? `${head}-${tail}` : head;
}

/** Place names that differ between the channels and our dataset. */
const LOCATION_ALIASES = {
  mumbai: 'bombay', kolkata: 'calcutta', chennai: 'madras', colombus: 'columbus',
  vrndavana: 'vrindavan', vrindavana: 'vrindavan', vrindaban: 'vrindavan',
  vrndavan: 'vrindavan', navadvipa: 'mayapur', mayapura: 'mayapur',
  honolulu: 'hawaii', tehran: 'teheran',
};

/**
 * Country/state qualifiers the channels append. They must not count as a place
 * match -- otherwise "Vrindavan, India" and "Bombay, India" look like the same
 * venue because they share "india".
 */
const LOCATION_QUALIFIERS = new Set([
  'india', 'us', 'usa', 'uk', 'england', 'scotland', 'wales', 'ireland',
  'france', 'canada', 'japan', 'australia', 'africa', 'south africa', 'kenya',
  'california', 'texas', 'tx', 'ma', 'pa', 'ohio', 'iran', 'germany', 'italy',
  'sweden', 'denmark', 'netherlands', 'switzerland', 'gujarat', 'gujrat',
  'maharashtra', 'fiji', 'mexico', 'brazil', 'hong kong', 'china', 'nepal',
  'new zealand', 'indonesia', 'malaysia', 'philippines', 'sri lanka', 'russia',
]);

/** Comparable place tokens: accent-stripped, qualifier-free, alias-resolved. */
function locationTokens(raw) {
  if (!raw) return new Set();
  const flat = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z\s,]/g, ' ');
  const out = new Set();
  for (let part of flat.split(',')) {
    part = part.trim().replace(/\s+/g, ' ');
    if (!part || LOCATION_QUALIFIERS.has(part)) continue;
    part = LOCATION_ALIASES[part] ?? part;
    if (LOCATION_QUALIFIERS.has(part)) continue;
    out.add(part);
    for (const w of part.split(' ')) {
      if (w.length > 2 && !LOCATION_QUALIFIERS.has(w)) out.add(LOCATION_ALIASES[w] ?? w);
    }
  }
  return out;
}

/**
 * Do a video's stated place and a record's place refer to the same venue?
 *
 * Unknown on either side counts as agreement -- absence of evidence is not a
 * contradiction. A real clash ("Vrindavan" vs "New York") is what we reject on.
 */
function locationAgrees(videoLoc, recordLoc) {
  const a = locationTokens(videoLoc);
  const b = locationTokens(recordLoc);
  if (!a.size || !b.size) return true;
  for (const t of a) if (b.has(t)) return true;
  return false;
}

const normLocation = (s) => {
  const t = [...locationTokens(s)];
  return t.length ? t[0] : '';
};

/** "@allsrilaprabhupadalectures" titles: verse + place + date, dash-separated. */
function parseSpl(title) {
  const m = title.match(/\b([A-Z][a-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})\s*$/);
  if (!m) return null;
  const date = isoDate(m[1], m[2], m[3]);
  if (!date) return null;

  const head = title.split(/\s+[—–]\s+|\s+--\s+/)[0].trim();
  const typeTok = head.match(/^(BG|SB|CC)\b/i)?.[1]?.toUpperCase()
    ?? (/^Bhagavad/i.test(head) ? 'BG' : /^Śrīmad|^Srimad/i.test(head) ? 'SB' : null);
  const verse = head.match(/(\d{1,3}(?:\.\d{1,3}){1,2}(?:\s*(?:--|–|—|-)\s*\d{1,3}(?:\.\d{1,3}){0,2})?)/)?.[1];

  // The trailing segment is "<Place>, <Month D, YYYY>"; drop the date to leave
  // the place, so it can validate the date join rather than being ignored.
  const segs = title.split(/\s+[—–]\s+|\s+--\s+/);
  const tail = segs.length > 1 ? segs[segs.length - 1] : '';
  const location =
    tail.replace(/\s*[A-Z][a-z]+\.?\s+\d{1,2},?\s+\d{4}\s*$/, '').replace(/[,\s]+$/, '').trim()
    || null;

  return {
    date,
    type: typeTok ? TYPE_BY_TOKEN[typeTok] : null,
    chapter: verse ? normalizeVerse(verse) : null,
    location,
  };
}

/** "@TheAcharya1" titles: pipe-separated, "theme | verse | place | Srila Prabhupada". */
function parseAcharya(title) {
  const fields = title.split('|').map((f) => f.trim()).filter(Boolean);
  if (fields.length < 2) return null;

  let date = null;
  let type = null;
  let chapter = null;
  let location = null;

  for (const f of fields) {
    // "SB 3.25.4" / "BG 2.13"
    const v = f.match(/^(BG|SB|CC)\.?\s+(\d{1,3}(?:\.\d{1,3}){1,2}(?:\s*(?:--|–|—|-)\s*\d{1,3}(?:\.\d{1,3}){0,2})?)/i);
    if (v && !chapter) {
      type = TYPE_BY_TOKEN[v[1].toUpperCase()];
      chapter = normalizeVerse(v[2]);
      continue;
    }
    // "May 13, 1969, Colombus, US" or "26 Sep 1972, Los Angeles, US"
    const d1 = f.match(/\b([A-Z][a-z]{2,})\.?\s+(\d{1,2}),\s*(\d{4})/);
    const d2 = f.match(/\b(\d{1,2})\s+([A-Z][a-z]{2,})\.?\s+(\d{4})/);
    if (!date && d1) date = isoDate(d1[1], d1[2], d1[3]);
    else if (!date && d2) date = isoDate(d2[2], d2[1], d2[3]);

    // The place sits in the field after the verse/date: "Mumbai, India",
    // "Los Angeles, US", "Dallas, TX US". Keep the whole field -- the qualifier
    // is stripped during comparison, and dropping everything after the first
    // comma loses two-word cities written as "New, Mayapur".
    if (!location && !d1 && !d2
        && !/^(BG|SB|CC)\b/i.test(f)
        && !/prabhupada/i.test(f)
        && !KIND_TO_TYPE[f.toLowerCase()]
        && /[a-z]/i.test(f)
        && f !== fields[0]) {
      location = f;
    }
  }
  // The trailing field names the session kind on non-lecture uploads.
  if (!chapter) {
    const kind = KIND_TO_TYPE[fields[fields.length - 1].toLowerCase()];
    if (kind && date) {
      // Type still has to agree downstream, so a Morning Walk cannot land on a
      // scripture lecture that happens to share its date.
      return { date, type: kind, chapter: null, location: null };
    }
  }

  // A date-bearing title puts the place in the same field as the date.
  if (!location) {
    for (const f of fields) {
      const after = f.match(/\d{4},\s*([^,]+)/);
      if (after) { location = normLocation(after[1]); break; }
    }
  }

  // A scripture upload must carry a verse. Reaching here without one means the
  // trailing field named no kind we recognise, so there is nothing safe to
  // join on -- matching on date alone would pin the video onto whichever
  // lecture shares its date.
  if (!chapter) return null;
  return { date, type, chapter, location };
}

/**
 * The trailing field of an Acharya title names the kind of session. These map
 * onto the `type` values in extra-recordings.json, which is what lets a Morning
 * Walk or Room Conversation video find its recording. Anything not listed here
 * is left unmatched rather than guessed at.
 */
const KIND_TO_TYPE = {
  'morning walk': 'MorningWalk',
  'conversation': 'Conversation',
  'room conversation': 'Conversation',
  'initiation': 'Initiation',
  'arrival': 'Arrival',
  'festival': 'Festival',
};

const SOURCES = [
  { key: 'spl', handle: '@allsrilaprabhupadalectures', channel: 'Srila Prabhupada Lectures', parse: parseSpl, priority: 0 },
  { key: 'acharya', handle: '@TheAcharya1', channel: 'The Acharya', parse: parseAcharya, priority: 1 },
];

// ---------------------------------------------------------------------- match

/**
 * Resolve one parsed title to exactly one lecture, or null.
 *
 * Date is the strong key. Verse+location is the fallback for titles that carry
 * no date, and it must land on a single lecture — an ambiguous verse is skipped
 * rather than guessed, because a wrong video is worse than a missing one.
 */
function resolve(p, idx, reject) {
  let cands = null;

  if (p.date) {
    cands = idx.byDate.get(p.date) ?? [];
    if (!cands.length) return reject(`no lecture on ${p.date}`);
    if (p.type) {
      // Type must agree whenever the title states one. Filtering only to break
      // same-day ties is not enough: on a date where we hold just one lecture,
      // a BG video would otherwise be pinned onto an SB lecture.
      const byType = cands.filter((c) => c.type === p.type);
      if (!byType.length) return reject(`no ${p.type} lecture on ${p.date}`);
      cands = byType;
    }
    if (cands.length > 1 && p.chapter) {
      const byCh = cands.filter(
        (c) => c.verseKey === p.chapter || c.verseKey?.startsWith(p.chapter)
      );
      if (byCh.length) cands = byCh;
    }
  } else {
    if (!p.type || !p.chapter) return reject('no date and no verse');
    cands = (idx.byVerse.get(`${p.type}|${p.chapter}`) ?? []).slice();
    if (!cands.length) return reject(`no lecture on ${p.type} ${p.chapter}`);
    if (cands.length > 1 && p.location) {
      const byLoc = cands.filter((c) => locationAgrees(p.location, c.location));
      if (byLoc.length) cands = byLoc;
    }
  }

  if (cands.length !== 1) return reject(`${cands.length} candidates`);

  // Place is a validator, not merely a tie-breaker. Narrowing to one candidate
  // does not make it the right one: our dataset does not hold every session, so
  // a video of "BG 7.15, Vrindavan" would otherwise be pinned onto the only
  // BG 7.15 we do hold, which was given in New York. Verified false positives
  // this catches: 661007bgnyc, 721101sbvrn, 730227sbjaka.
  if (p.location && !locationAgrees(p.location, cands[0].location)) {
    return reject(`place mismatch: video says "${p.location}", record says "${cands[0].location}"`);
  }
  return cands[0];
}

async function main() {
  const lectures = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'data/lectures.json'), 'utf8')
  );

  // Both files feed the index: the app itself merges them (see
  // hooks/useAllRecordings.ts), so a video of a Conversation or Morning Walk
  // has a real lecture page to land on.
  const extra = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'data/extra-recordings.json'), 'utf8')
  );

  const idx = { byDate: new Map(), byVerse: new Map() };
  const addToIndex = (r) => {
    const rec = { ...r, pvId: r.pvId ?? r.id, verseKey: normalizeVerse(r.chapter ?? '') };
    // Placeholder dates like "1966-00-00" mean "sometime that year" and must
    // never be used as a join key.
    if (rec.date && !rec.date.endsWith('-00-00')) {
      if (!idx.byDate.has(rec.date)) idx.byDate.set(rec.date, []);
      idx.byDate.get(rec.date).push(rec);
    }
    if (!rec.verseKey) return;
    // Index the full range and, separately, the leading verse, so both
    // "SB 2.9.1-8" and a bare "SB 2.9.1" can find their lecture.
    for (const k of new Set([rec.verseKey, rec.verseKey.split('-')[0]])) {
      const key = `${rec.type}|${k}`;
      if (!idx.byVerse.has(key)) idx.byVerse.set(key, []);
      idx.byVerse.get(key).push(rec);
    }
  };
  for (const l of lectures) addToIndex(l);
  for (const r of extra) addToIndex(r);

  const map = {};
  const report = [];

  for (const src of SOURCES) {
    if (ONLY && ONLY !== src.key) continue;
    console.log(`\n[${src.key}] ${src.handle}`);
    let videos;
    try {
      videos = await fetchChannel(src.handle);
    } catch (e) {
      console.log(`    FAILED: ${e.message}`);
      report.push({ src: src.key, error: e.message });
      continue;
    }

    let matched = 0;
    let alternates = 0;
    const unmatched = [];

    for (const v of videos) {
      const p = src.parse(v.title);
      if (!p) { unmatched.push(`${v.title}  [unparsed]`); continue; }

      const hit = resolve(p, idx, (why) => {
        unmatched.push(`${v.title}  [${why}]`);
        return null;
      });
      if (!hit) continue;

      const entry = {
        videoId: v.videoId,
        ytTitle: v.title,
        channel: src.channel,
        durationSec: v.durationSec ?? undefined,
      };

      const existing = map[hit.pvId];
      if (!existing) {
        map[hit.pvId] = entry;
        matched++;
      } else if (existing.videoId === v.videoId) {
        // same video seen twice, nothing to do
      } else {
        (existing.alternates ||= []).push(entry);
        alternates++;
      }
    }

    console.log(`    videos ${videos.length} | matched ${matched} | alternates ${alternates} | unmatched ${unmatched.length}`);
    report.push({ src: src.key, videos: videos.length, matched, alternates, unmatched });
  }

  const out = path.join(ROOT, 'data/youtubeMap.json');
  fs.writeFileSync(out, JSON.stringify(map, null, 2) + '\n');

  const uniq = (arr) => new Set(arr.map((l) => l.pvId)).size;
  const bg = lectures.filter((l) => l.type === 'Bhagavad-gita');
  const sb = lectures.filter((l) => l.type === 'Srimad-Bhagavatam');
  const covered = (set) => uniq(set.filter((l) => map[l.pvId]));

  console.log('\n─── coverage ' + '─'.repeat(30));
  console.log(`  lectures with a video : ${Object.keys(map).length} / ${uniq(lectures)} unique pvIds`);
  console.log(`    Bhagavad-gita       : ${covered(bg)} / ${uniq(bg)}`);
  console.log(`    Srimad-Bhagavatam   : ${covered(sb)} / ${uniq(sb)}`);
  const withAlt = Object.values(map).filter((e) => e.alternates?.length).length;
  console.log(`  with a second source  : ${withAlt}`);
  console.log(`\nwrote ${path.relative(ROOT, out)}`);

  if (VERBOSE) {
    for (const r of report) {
      if (!r.unmatched?.length) continue;
      console.log(`\n[${r.src}] unmatched:`);
      for (const u of r.unmatched) console.log('  ' + u);
    }
  } else {
    for (const r of report) {
      if (!r.unmatched?.length) continue;
      console.log(`\n[${r.src}] sample unmatched (--verbose for all):`);
      for (const u of r.unmatched.slice(0, 6)) console.log('  ' + u);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
