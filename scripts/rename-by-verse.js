/**
 * Reorganizes already-downloaded scripture files into verse-first naming
 * and adds Chapter subfolders for SB and CC.
 *
 * Run: node scripts/rename-by-verse.js
 * Safe to run multiple times — skips already-renamed files.
 */

const fs = require('fs');
const path = require('path');

const DOWNLOADS = path.join(__dirname, '..', 'downloads');

function sanitize(str) {
  return str.replace(/[/\\:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
}

function moveFile(src, dest) {
  if (src === dest) return false;
  if (!fs.existsSync(src)) return false;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.renameSync(src, dest);
  return true;
}

// Parse "pvId - Title Parts - Location - Part N.mp3" → { id, title, location, partSuffix }
function parseFilename(filename) {
  const withoutExt = filename.replace(/\.mp3$/, '');
  const partMatch = withoutExt.match(/( - Part \d+)$/);
  const partSuffix = partMatch ? partMatch[1] : '';
  const base = partMatch ? withoutExt.slice(0, -partSuffix.length) : withoutExt;

  const parts = base.split(' - ');
  if (parts.length < 3) return null;

  return {
    id: parts[0],
    title: parts.slice(1, -1).join(' - '),
    location: parts[parts.length - 1],
    partSuffix,
  };
}

function isAlreadyVerseFirst(filename) {
  // Verse-first files start with scripture prefix, not a pvId (6 digits + letters)
  return !/^\d{6}[a-z]/.test(filename);
}

// Rename files in a flat folder: {id} - {title} - {loc} → {title} - {id} - {loc}
function renameFolderFiles(folderPath) {
  if (!fs.existsSync(folderPath)) return 0;
  let count = 0;
  for (const file of fs.readdirSync(folderPath)) {
    if (!file.endsWith('.mp3') || isAlreadyVerseFirst(file)) continue;
    const p = parseFilename(file);
    if (!p) continue;
    const newName = sanitize(`${p.title} - ${p.id} - ${p.location}`) + p.partSuffix + '.mp3';
    if (moveFile(path.join(folderPath, file), path.join(folderPath, newName))) {
      console.log(`  BG  ${file}\n    → ${newName}`);
      count++;
    }
  }
  return count;
}

// Move SB files into Chapter subfolders and rename verse-first
function reorganizeSBCanto(cantoPath) {
  if (!fs.existsSync(cantoPath)) return 0;
  let count = 0;

  // Process flat files (old format, no chapter subfolder yet)
  for (const file of fs.readdirSync(cantoPath)) {
    const filePath = path.join(cantoPath, file);
    if (!file.endsWith('.mp3')) continue;

    const p = parseFilename(file);
    if (!p) continue;

    // Extract chapter: "SB 01.02.03" → chapter "02"
    const verseMatch = p.title.match(/SB\s+\d+\.(\d+)/i);
    if (!verseMatch) continue;

    const chapN = String(parseInt(verseMatch[1], 10)).padStart(2, '0');
    const chapterDir = path.join(cantoPath, `Chapter-${chapN}`);

    const alreadyVerseFirst = isAlreadyVerseFirst(file);
    const newName = alreadyVerseFirst
      ? file
      : sanitize(`${p.title} - ${p.id} - ${p.location}`) + p.partSuffix + '.mp3';

    if (moveFile(filePath, path.join(chapterDir, newName))) {
      console.log(`  SB  ${file}\n    → Canto-${path.basename(cantoPath).replace('Canto-','')}/Chapter-${chapN}/${newName}`);
      count++;
    }
  }

  // Also rename any already-in-chapter files that still have id-first naming
  for (const entry of fs.readdirSync(cantoPath)) {
    const chapterPath = path.join(cantoPath, entry);
    if (fs.statSync(chapterPath).isDirectory() && entry.startsWith('Chapter-')) {
      count += renameFolderFiles(chapterPath);
    }
  }

  return count;
}

// Move CC files into Chapter subfolders and rename verse-first
function reorganizeCCLila(lilaPath) {
  if (!fs.existsSync(lilaPath)) return 0;
  let count = 0;

  for (const file of fs.readdirSync(lilaPath)) {
    const filePath = path.join(lilaPath, file);
    if (!file.endsWith('.mp3')) continue;

    const p = parseFilename(file);
    if (!p) continue;

    // Extract chapter: "CC Adi 01.01" → "01"
    const chapMatch = p.title.match(/CC\s+(?:Adi|Madhya|Antya)\s+(\d+)/i);
    if (!chapMatch) continue;

    const chapN = String(parseInt(chapMatch[1], 10)).padStart(2, '0');
    const chapterDir = path.join(lilaPath, `Chapter-${chapN}`);

    const alreadyVerseFirst = isAlreadyVerseFirst(file);
    const newName = alreadyVerseFirst
      ? file
      : sanitize(`${p.title} - ${p.id} - ${p.location}`) + p.partSuffix + '.mp3';

    if (moveFile(filePath, path.join(chapterDir, newName))) {
      console.log(`  CC  ${file}\n    → Chapter-${chapN}/${newName}`);
      count++;
    }
  }

  for (const entry of fs.readdirSync(lilaPath)) {
    const chapterPath = path.join(lilaPath, entry);
    if (fs.statSync(chapterPath).isDirectory() && entry.startsWith('Chapter-')) {
      count += renameFolderFiles(chapterPath);
    }
  }

  return count;
}

function main() {
  let total = 0;

  console.log('\n── Bhagavad-gita: renaming to verse-first ──');
  const bgRoot = path.join(DOWNLOADS, 'Bhagavad-gita');
  if (fs.existsSync(bgRoot)) {
    for (const folder of fs.readdirSync(bgRoot)) {
      const fp = path.join(bgRoot, folder);
      if (fs.statSync(fp).isDirectory()) total += renameFolderFiles(fp);
    }
  }

  console.log('\n── Srimad-Bhagavatam: adding Chapter subfolders + verse-first ──');
  const sbRoot = path.join(DOWNLOADS, 'Srimad-Bhagavatam');
  if (fs.existsSync(sbRoot)) {
    for (const canto of fs.readdirSync(sbRoot)) {
      const cp = path.join(sbRoot, canto);
      if (fs.statSync(cp).isDirectory()) total += reorganizeSBCanto(cp);
    }
  }

  console.log('\n── Caitanya-caritamrta: adding Chapter subfolders + verse-first ──');
  const ccRoot = path.join(DOWNLOADS, 'Caitanya-caritamrta');
  if (fs.existsSync(ccRoot)) {
    for (const lila of fs.readdirSync(ccRoot)) {
      const lp = path.join(ccRoot, lila);
      if (fs.statSync(lp).isDirectory()) total += reorganizeCCLila(lp);
    }
  }

  console.log('\n── Nectar of Devotion: renaming to verse-first ──');
  total += renameFolderFiles(path.join(DOWNLOADS, 'Nectar-of-Devotion'));

  console.log(`\nDone. ${total} files reorganized.`);
}

main();
