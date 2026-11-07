#!/usr/bin/env node
/**
 * Audits data/youtubeMap.json for mis-mappings.
 *
 * Written because "the mapper's own rules agree with the mapper" proves nothing.
 * Three checks, in increasing order of independence:
 *
 *   1. consistency  Re-derives place and date from each video title using code
 *                   written separately from the mapper, and compares against the
 *                   record. Catches contradictions the join never looked at.
 *                   Cheap, covers every link, but shares the mapper's inputs.
 *
 *   2. agreement    Where two channels independently mapped to the same lecture,
 *                   compares their durations. Neither channel knows about the
 *                   other, so this is real corroboration. No network needed.
 *
 *   3. audio        Fully independent: fetches the lecture's real audio from
 *                   vanisource/S3 and measures it with ffprobe, then checks the
 *                   video length against it. Neither duration was ever a join
 *                   key. Needs network + ffmpeg, so it samples.
 *
 * Note for check 3: the channels publish different *edits* of one session, so a
 * video is routinely shorter than the full audio. A video meaningfully LONGER
 * than its source, or a tiny fraction of it, is the actual danger sign.
 *
 *   node scripts/verify-youtube-map.js                  # checks 1 + 2
 *   node scripts/verify-youtube-map.js --audio 40       # adds check 3 (sampled)
 *   node scripts/verify-youtube-map.js --audio 40 --verbose
 */

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const run = promisify(execFile);

const ROOT = path.join(__dirname, '..');
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const argOf = (f, d) => {
  const i = process.argv.indexOf(f);
  return i > -1 ? process.argv[i + 1] : d;
};
const VERBOSE = process.argv.includes('--verbose');
const AUDIO_N = process.argv.includes('--audio') ? Number(argOf('--audio', 30)) : 0;

const map = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/youtubeMap.json'), 'utf8'));
const lectures = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/lectures.json'), 'utf8'));
const extra = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/extra-recordings.json'), 'utf8'));

const recs = new Map();
for (const r of [...lectures, ...extra]) {
  const k = r.pvId ?? r.id;
  if (!recs.has(k)) recs.set(k, []);
  recs.get(k).push(r);
}

const links = [];
for (const [pv, e] of Object.entries(map)) {
  for (const v of [e, ...(e.alternates ?? [])]) links.push({ pv, ...v });
}

// ------------------------------------------------- check 1: title consistency

const QUALIFIERS = new Set([
  'india', 'us', 'usa', 'uk', 'england', 'scotland', 'wales', 'ireland', 'france',
  'canada', 'japan', 'australia', 'africa', 'south africa', 'kenya', 'california',
  'texas', 'tx', 'ma', 'pa', 'ohio', 'iran', 'germany', 'italy', 'sweden',
  'denmark', 'netherlands', 'switzerland', 'gujarat', 'gujrat', 'maharashtra',
  'fiji', 'mexico', 'brazil', 'hong kong', 'china', 'nepal', 'new zealand',
  'indonesia', 'malaysia', 'philippines', 'sri lanka', 'russia',
]);
const ALIASES = {
  mumbai: 'bombay', kolkata: 'calcutta', chennai: 'madras', colombus: 'columbus',
  vrndavana: 'vrindavan', vrindavana: 'vrindavan', vrindaban: 'vrindavan',
  vrndavan: 'vrindavan', navadvipa: 'mayapur', mayapura: 'mayapur',
  honolulu: 'hawaii', tehran: 'teheran',
};
const KINDS = new Set([
  'morning walk', 'conversation', 'room conversation', 'initiation', 'arrival', 'festival',
]);
const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function placeTokens(raw) {
  if (!raw) return new Set();
  const flat = raw.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z\s,]/g, ' ');
  const out = new Set();
  for (let part of flat.split(',')) {
    part = part.trim().replace(/\s+/g, ' ');
    if (!part || QUALIFIERS.has(part)) continue;
    part = ALIASES[part] ?? part;
    if (QUALIFIERS.has(part)) continue;
    out.add(part);
    for (const w of part.split(' ')) {
      if (w.length > 2 && !QUALIFIERS.has(w)) out.add(ALIASES[w] ?? w);
    }
  }
  return out;
}

/** Union of every field that could name a place, so the check cannot miss it. */
function titlePlaces(t) {
  const out = [];
  if (t.includes('|')) {
    for (const f of t.split('|').map((x) => x.trim()).filter(Boolean)) {
      if (/^(BG|SB|CC)\b/i.test(f)) continue;
      if (/prabhupada/i.test(f)) continue;
      if (KINDS.has(f.toLowerCase())) continue;
      out.push(
        f.replace(/\b\d{1,2}\s+[A-Z][a-z]{2,}\.?\s+\d{4}\b/g, '')
         .replace(/\b[A-Z][a-z]{2,}\.?\s+\d{1,2},?\s+\d{4}\b/g, '')
      );
    }
  } else {
    const segs = t.split(/\s+[—–]\s+/);
    if (segs.length > 1) {
      out.push(segs[segs.length - 1].replace(/\s*[A-Z][a-z]+\.?\s+\d{1,2},?\s+\d{4}\s*$/, ''));
    }
  }
  return out.join(', ');
}

function titleDate(t) {
  const d1 = t.match(/\b([A-Z][a-z]{2,})\.?\s+(\d{1,2}),\s*(\d{4})/);
  const d2 = t.match(/\b(\d{1,2})\s+([A-Z][a-z]{2,})\.?\s+(\d{4})/);
  const iso = (mo, d, y) => {
    const m = MONTHS[mo.slice(0, 3).toLowerCase()];
    return m ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null;
  };
  if (d1) return iso(d1[1], d1[2], d1[3]);
  if (d2) return iso(d2[2], d2[1], d2[3]);
  return null;
}

function checkConsistency() {
  let placeOk = 0, placeUnknown = 0, dateOk = 0, dateNone = 0;
  const bad = [];
  for (const l of links) {
    const rs = recs.get(l.pv) ?? [];
    if (!rs.length) { bad.push(['ORPHAN', l.pv, l.ytTitle]); continue; }

    const a = placeTokens(titlePlaces(l.ytTitle));
    const b = new Set();
    for (const r of rs) for (const t of placeTokens(r.location)) b.add(t);
    if (a.size && b.size) {
      if ([...a].some((t) => b.has(t))) placeOk++;
      else bad.push(['PLACE', l.pv, `video "${titlePlaces(l.ytTitle).trim()}" vs record "${rs[0].location}"`, l.ytTitle]);
    } else placeUnknown++;

    const iso = titleDate(l.ytTitle);
    if (!iso) dateNone++;
    else if (rs.some((r) => r.date === iso)) dateOk++;
    else bad.push(['DATE', l.pv, `video ${iso} vs record ${rs.map((r) => r.date).join('/')}`, l.ytTitle]);
  }
  console.log('\n1. title consistency');
  console.log(`   links checked        : ${links.length}`);
  console.log(`   place agrees         : ${placeOk}   (place not stated: ${placeUnknown})`);
  console.log(`   date agrees          : ${dateOk}   (date not stated: ${dateNone})`);
  console.log(`   PROBLEMS             : ${bad.length}`);
  for (const b of bad.slice(0, VERBOSE ? 1e9 : 15)) {
    console.log(`     [${b[0]}] ${b[1]}  ${b[2]}`);
  }
  return bad.length;
}

// -------------------------------------------- check 2: cross-channel agreement

function checkAgreement() {
  const pairs = [];
  for (const [pv, e] of Object.entries(map)) {
    for (const a of e.alternates ?? []) {
      if (e.durationSec && a.durationSec) {
        pairs.push({ pv, x: e, y: a, rel: Math.abs(e.durationSec - a.durationSec) / Math.max(e.durationSec, a.durationSec) });
      }
    }
  }
  pairs.sort((p, q) => q.rel - p.rel);
  const within = (t) => pairs.filter((p) => p.rel <= t).length;
  console.log('\n2. cross-channel agreement (two channels, same lecture)');
  console.log(`   independently double-mapped : ${pairs.length}`);
  for (const t of [0.05, 0.10, 0.25, 0.50]) {
    console.log(`     durations within ${String(Math.round(t * 100)).padStart(3)}%    : ${within(t)}  (${Math.round(100 * within(t) / pairs.length)}%)`);
  }
  console.log('   NOTE a large gap usually means different edits of one session,');
  console.log('        not a wrong match — treat these as leads, not failures.');
  for (const p of pairs.slice(0, VERBOSE ? 20 : 5)) {
    console.log(`     ${p.pv}  ${Math.round(100 * p.rel)}%  ${p.x.durationSec}s vs ${p.y.durationSec}s`);
  }
  return 0;
}

// ------------------------------------- check 3: against the real lecture audio

async function audioSeconds(rec) {
  const page = rec.vanisourceUrl?.split('/wiki/')[1];
  if (!page) return null;
  const res = await fetch(
    `https://vanisource.org/w/api.php?action=parse&page=${page}&prop=wikitext&format=json`,
    { headers: { 'User-Agent': UA } }
  );
  const j = await res.json();
  const wt = j?.parse?.wikitext?.['*'] ?? '';
  const urls = [...wt.matchAll(/<mp3player>\s*(https?:\/\/[^\s<]+\.mp3)/g)].map((m) => m[1]);
  if (!urls.length) return null;
  let total = 0;
  for (const u of urls) {
    try {
      const { stdout } = await run(
        'ffprobe',
        ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', u],
        { timeout: 90000 }
      );
      total += parseFloat(stdout.trim()) || 0;
    } catch { /* a dead part shouldn't void the lecture */ }
  }
  return total || null;
}

async function checkAudio(n) {
  const byPv = new Map();
  for (const r of lectures) if (!byPv.has(r.pvId)) byPv.set(r.pvId, r);
  const entries = Object.entries(map).filter(([pv]) => byPv.has(pv));
  const step = Math.max(1, Math.floor(entries.length / n));
  const sample = [];
  for (let i = 0; i < entries.length && sample.length < n; i += step) sample.push(entries[i]);

  let ok = 0, susp = 0, noAudio = 0;
  const bad = [];
  let idx = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    for (;;) {
      const i = idx++;
      if (i >= sample.length) break;
      const [pv, e] = sample[i];
      const rec = byPv.get(pv);
      const vids = [e, ...(e.alternates ?? [])].filter((v) => v.durationSec);
      if (!vids.length) continue;
      let secs = null;
      try { secs = await audioSeconds(rec); } catch { /* network */ }
      if (!secs) { noAudio++; continue; }
      const best = vids
        .map((v) => v.durationSec / secs)
        .reduce((a, b) => (Math.abs(b - 1) < Math.abs(a - 1) ? b : a));
      if (best <= 1.15 && best >= 0.33) ok++;
      else { susp++; bad.push({ pv, chapter: rec.chapter, secs, vids, best }); }
    }
  }));

  console.log(`\n3. against the real lecture audio (sampled ${ok + susp + noAudio} of ${entries.length})`);
  console.log(`   video length consistent : ${ok}`);
  console.log(`   SUSPICIOUS              : ${susp}`);
  console.log(`   audio unreachable       : ${noAudio}`);
  for (const b of bad) {
    console.log(`     ${b.pv} ${b.chapter}  audio=${Math.round(b.secs)}s  ` +
      `videos=${b.vids.map((v) => v.durationSec + 's').join('/')}  ratio=${b.best.toFixed(2)}`);
  }
  return susp;
}

(async () => {
  console.log(`auditing ${Object.keys(map).length} mapped recordings / ${links.length} video links`);
  let problems = checkConsistency();
  checkAgreement();
  if (AUDIO_N) problems += await checkAudio(AUDIO_N);
  console.log(`\n${problems === 0 ? 'PASS — no contradictions found.' : `FAIL — ${problems} problem(s) above.`}`);
  process.exit(problems === 0 ? 0 : 1);
})();
