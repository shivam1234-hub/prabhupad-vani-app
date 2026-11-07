/**
 * Downloads all Srila Prabhupada audio lectures from vanisource.org (S3).
 *
 * Usage:
 *   node scripts/download.js                              # BG + SB (1,412 lectures)
 *   node scripts/download.js --type bg                   # Bhagavad-gita only
 *   node scripts/download.js --type sb                   # Srimad-Bhagavatam only
 *   node scripts/download.js --file data/extra-recordings.json   # CC, Conversations, etc.
 *   node scripts/download.js --dry-run                   # show what would be downloaded
 *
 * Output folder structure:
 *   downloads/
 *     Bhagavad-gita/Introduction/ Chapter-02/ ... Chapter-18/
 *     Srimad-Bhagavatam/Canto-01/ ... Canto-12/
 *     Caitanya-caritamrta/Adi-lila/ Madhya-lila/ Antya-lila/
 *     Nectar-of-Devotion/
 *     Festival-Lectures/
 *     General-Lectures/
 *     Arrival-Departure-Talks/
 *     Conversations/1966/ ... /1977/
 *     Morning-Walks/1972/ ... /1977/
 *
 * Resume-safe: skips files that are already present on disk.
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const VANISOURCE_AGENT = new https.Agent({ rejectUnauthorized: false });
const BASE_API = 'https://vanisource.org/w/api.php';
const OUTPUT_DIR = path.join(__dirname, '..', 'downloads');
const LOG_FILE = path.join(OUTPUT_DIR, 'download-log.jsonl');

// Number of lectures to process concurrently (API calls + downloads)
const CONCURRENCY = 15;

// ── CLI args ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const typeFilter = (() => {
  const i = args.indexOf('--type');
  if (i === -1) return null;
  const v = (args[i + 1] || '').toLowerCase();
  if (v === 'bg') return 'Bhagavad-gita';
  if (v === 'sb') return 'Srimad-Bhagavatam';
  console.error('--type must be "bg" or "sb"');
  process.exit(1);
})();
const DRY_RUN = args.includes('--dry-run');
const fileArg = (() => {
  const i = args.indexOf('--file');
  return i !== -1 ? args[i + 1] : null;
})();

// Scripture types get verse-first filenames so folders sort by sloka naturally
const SCRIPTURE_TYPES = new Set([
  'Bhagavad-gita', 'Srimad-Bhagavatam', 'CC', 'NOD', 'Isopanisad', 'BrahmaSamhita',
]);

// ── Folder mapping ───────────────────────────────────────────────────────────
function getLectureFolder(recording) {
  // Extra recordings carry a pre-computed folder field
  if (recording.folder) {
    // CC: add Chapter subfolder from title "CC Adi 01.01" → Chapter-01
    if (recording.type === 'CC') {
      const m = recording.title.match(/CC\s+(?:Adi|Madhya|Antya)\s+(\d+)/i);
      if (m) {
        return path.join(OUTPUT_DIR, recording.folder,
          `Chapter-${String(parseInt(m[1], 10)).padStart(2, '0')}`);
      }
    }
    // Isopanisad: add Mantra subfolder
    if (recording.type === 'Isopanisad') {
      const m = recording.title.match(/Mantra[- ](\d+)/i) || recording.title.match(/(\d+)/);
      if (m) {
        return path.join(OUTPUT_DIR, recording.folder,
          `Mantra-${String(parseInt(m[1], 10)).padStart(2, '0')}`);
      }
    }
    return path.join(OUTPUT_DIR, recording.folder);
  }

  const { type, chapter } = recording;

  if (type === 'Bhagavad-gita') {
    if (/^(Introduction|Preface)/i.test(chapter)) {
      return path.join(OUTPUT_DIR, 'Bhagavad-gita', 'Introduction');
    }
    const n = chapter.match(/^(\d+)/)?.[1];
    const label = n ? `Chapter-${String(parseInt(n, 10)).padStart(2, '0')}` : 'Other';
    return path.join(OUTPUT_DIR, 'Bhagavad-gita', label);
  }

  // Srimad-Bhagavatam: "01.02.03" → Canto-01/Chapter-02
  const parts = chapter.split('.');
  const cantoN = parts[0] ? String(parseInt(parts[0], 10)).padStart(2, '0') : null;
  const chapN  = parts[1] ? String(parseInt(parts[1], 10)).padStart(2, '0') : null;
  if (!cantoN) return path.join(OUTPUT_DIR, 'Srimad-Bhagavatam', 'Other');
  return chapN
    ? path.join(OUTPUT_DIR, 'Srimad-Bhagavatam', `Canto-${cantoN}`, `Chapter-${chapN}`)
    : path.join(OUTPUT_DIR, 'Srimad-Bhagavatam', `Canto-${cantoN}`);
}

// Unique ID — pvId for BG/SB, pageid for extras
function getRecordingId(r) { return r.pvId || r.id; }

// Scripture: verse title first → files sort by sloka number alphabetically
function getBaseName(r) {
  const id = getRecordingId(r);
  if (SCRIPTURE_TYPES.has(r.type)) {
    return sanitizeFilename(`${r.title} - ${id} - ${r.location}`);
  }
  return sanitizeFilename(`${id} - ${r.title} - ${r.location}`);
}

function sanitizeFilename(str) {
  return str
    .replace(/[/\\:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Network helpers ──────────────────────────────────────────────────────────
function fetchBuffer(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const reqOpts = {
      headers: { 'User-Agent': 'PrabhupadaVaniApp/1.0 (educational research)' },
      ...opts,
    };
    mod.get(url, reqOpts, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    }).on('error', reject);
  });
}

async function fetchJson(url) {
  const { body } = await fetchBuffer(url, { agent: VANISOURCE_AGENT });
  try { return JSON.parse(body.toString()); }
  catch { return null; }
}

function extractMp3Urls(wikitext) {
  const urls = [];
  const re = /<mp3player>(https?:\/\/[^\s<]+)<\/mp3player>/gi;
  let m;
  while ((m = re.exec(wikitext)) !== null) urls.push(m[1].trim());
  return urls;
}

async function getAudioUrls(vanisourceUrl) {
  const pageTitle = vanisourceUrl.split('/wiki/')[1];
  if (!pageTitle) return [];
  const url = `${BASE_API}?action=parse&page=${pageTitle}&prop=wikitext&format=json`;
  const data = await fetchJson(url);
  const wikitext = data?.parse?.wikitext?.['*'];
  return wikitext ? extractMp3Urls(wikitext) : [];
}

// Download a URL to destPath, following up to 5 redirects.
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const tmpPath = destPath + '.tmp';

    function doGet(url, depth) {
      if (depth > 5) return reject(new Error('Too many redirects'));
      const mod = url.startsWith('https') ? https : http;
      mod.get(url, { headers: { 'User-Agent': 'PrabhupadaVaniApp/1.0' } }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
          res.resume();
          return doGet(res.headers.location, depth + 1);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
        }
        const out = fs.createWriteStream(tmpPath);
        res.pipe(out);
        out.on('finish', () => {
          out.close(() => {
            try { fs.renameSync(tmpPath, destPath); resolve(); }
            catch (e) { reject(e); }
          });
        });
        out.on('error', err => { fs.unlink(tmpPath, () => {}); reject(err); });
      }).on('error', err => { fs.unlink(tmpPath, () => {}); reject(err); });
    }

    doGet(url, 0);
  });
}

// ── Per-recording logic ──────────────────────────────────────────────────────
function isAlreadyDownloaded(folder, id) {
  if (!fs.existsSync(folder)) return false;
  // Use includes() so verse-first filenames are still found by their embedded id
  return fs.readdirSync(folder).some(f => f.includes(id));
}

async function processLecture(recording, index, total) {
  const id = getRecordingId(recording);
  const folder = getLectureFolder(recording);
  const prefix = `[${String(index).padStart(4, '0')}/${total}]`;

  if (isAlreadyDownloaded(folder, id)) {
    process.stdout.write(`${prefix} SKIP  ${id}\n`);
    return { id, status: 'skipped' };
  }

  if (DRY_RUN) {
    process.stdout.write(`${prefix} WOULD ${id} → ${path.relative(OUTPUT_DIR, folder)}\n`);
    return { id, status: 'dry_run' };
  }

  let audioUrls;
  try {
    audioUrls = await getAudioUrls(recording.vanisourceUrl);
  } catch (e) {
    process.stderr.write(`${prefix} ERR   ${id} (fetch URLs): ${e.message}\n`);
    appendLog({ id, status: 'error', stage: 'fetch_urls', error: e.message });
    return { id, status: 'error' };
  }

  if (audioUrls.length === 0) {
    process.stdout.write(`${prefix} NOAUD ${id}\n`);
    appendLog({ id, status: 'no_audio' });
    return { id, status: 'no_audio' };
  }

  fs.mkdirSync(folder, { recursive: true });

  const baseName = getBaseName(recording);
  let anyError = false;

  for (let i = 0; i < audioUrls.length; i++) {
    const suffix = audioUrls.length > 1 ? ` - Part ${i + 1}` : '';
    const destPath = path.join(folder, `${baseName}${suffix}.mp3`);

    if (fs.existsSync(destPath)) continue;

    try {
      await downloadFile(audioUrls[i], destPath);
      const sizeKB = Math.round(fs.statSync(destPath).size / 1024);
      process.stdout.write(
        `${prefix} OK    ${id}${audioUrls.length > 1 ? ` pt${i + 1}/${audioUrls.length}` : ''} (${sizeKB} KB)\n`
      );
    } catch (e) {
      process.stderr.write(`${prefix} ERR   ${id} pt${i + 1}: ${e.message}\n`);
      anyError = true;
    }
  }

  const status = anyError ? 'partial_error' : 'ok';
  appendLog({ id, status, parts: audioUrls.length });
  return { id, status };
}

// ── Log helper ───────────────────────────────────────────────────────────────
function appendLog(entry) {
  fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const dataFile = fileArg
    ? path.resolve(process.cwd(), fileArg)
    : path.join(__dirname, '..', 'data', 'lectures.json');

  if (!fs.existsSync(dataFile)) {
    console.error(`Data file not found: ${dataFile}`);
    console.error('Run node scripts/scrape-extra.js first to generate extra-recordings.json');
    process.exit(1);
  }

  const all = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  const lectures = typeFilter ? all.filter(l => l.type === typeFilter) : all;

  // Build per-type counts for the header
  const typeCounts = {};
  lectures.forEach(l => { typeCounts[l.type] = (typeCounts[l.type] || 0) + 1; });
  const typesSummary = Object.entries(typeCounts).map(([t, n]) => `${t}: ${n}`).join(', ');

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(' Srila Prabhupada Audio Downloader');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(` File     : ${path.basename(dataFile)}`);
  console.log(` Total    : ${lectures.length} recordings`);
  console.log(` Types    : ${typesSummary}`);
  console.log(` Output   : ${OUTPUT_DIR}`);
  console.log(` Mode     : ${DRY_RUN ? 'DRY RUN (no files written)' : 'DOWNLOAD'}`);
  if (typeFilter) console.log(` Filter   : ${typeFilter} only`);
  console.log('───────────────────────────────────────────────────────────\n');

  if (!DRY_RUN) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const stats = { ok: 0, skipped: 0, no_audio: 0, error: 0, partial_error: 0, dry_run: 0 };

  // Concurrent queue — always keeps CONCURRENCY slots busy
  let index = 0;
  async function worker() {
    while (index < lectures.length) {
      const i = index++;
      const result = await processLecture(lectures[i], i + 1, lectures.length);
      stats[result.status] = (stats[result.status] || 0) + 1;
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(' Summary');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(` Downloaded  : ${stats.ok}`);
  console.log(` Skipped     : ${stats.skipped} (already on disk)`);
  console.log(` No audio    : ${stats.no_audio}`);
  console.log(` Errors      : ${stats.error + (stats.partial_error || 0)}`);
  if (DRY_RUN) console.log(` Dry run     : ${stats.dry_run}`);
  console.log('═══════════════════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
