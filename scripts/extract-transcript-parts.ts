// Fetches a lecture's transcript from vanisource and writes one plain-text
// file per audio part, containing only what was actually spoken (see
// toAlignmentText in utils/wikitextParser.ts). These .txt files are the
// ground-truth text fed to lecture_to_screens.py's `align` mode.
//
// Usage:
//   npx tsx scripts/extract-transcript-parts.ts \
//     --recording-id 660219bgnyc \
//     --vanisource-url "https://vanisource.org/wiki/660219_-_Lecture_BG_Introduction_-_New_York" \
//     --out data/screens-src/660219bgnyc

import * as fs from 'fs';
import * as path from 'path';
import { parseWikitext, toAlignmentText } from '../utils/wikitextParser';

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      args[key] = argv[i + 1];
      i++;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const recordingId = args['recording-id'];
  const vanisourceUrl = args['vanisource-url'];
  const outDir = args['out'];

  if (!recordingId || !vanisourceUrl || !outDir) {
    console.error('Usage: extract-transcript-parts.ts --recording-id <id> --vanisource-url <url> --out <dir>');
    process.exit(1);
  }

  const pageTitle = vanisourceUrl.split('/wiki/')[1];
  if (!pageTitle) {
    console.error(`Not a vanisource wiki URL: ${vanisourceUrl}`);
    process.exit(1);
  }

  const apiUrl = `https://vanisource.org/w/api.php?action=parse&page=${pageTitle}&prop=wikitext&format=json`;
  const res = await fetch(apiUrl);
  if (!res.ok) {
    console.error(`Network error ${res.status} fetching ${apiUrl}`);
    process.exit(1);
  }
  const json = await res.json();
  const wikitext = json?.parse?.wikitext?.['*'];
  if (!wikitext) {
    console.error('No transcript content returned — check the vanisource URL.');
    process.exit(1);
  }

  const { audioUrls, parts } = parseWikitext(wikitext);
  if (!audioUrls.length) {
    console.error('No <mp3player> audio URLs found in this transcript.');
    process.exit(1);
  }

  fs.mkdirSync(outDir, { recursive: true });

  const matchedIndices = new Set<number>();
  for (const part of parts) {
    if (!part.audioUrl) continue;
    const partIndex = audioUrls.indexOf(part.audioUrl);
    if (partIndex === -1) continue;
    const alignmentText = toAlignmentText(part.text);
    if (!alignmentText) continue;
    const outPath = path.join(outDir, `part-${partIndex}.txt`);
    fs.writeFileSync(outPath, alignmentText, 'utf-8');
    matchedIndices.add(partIndex);
    console.log(`Wrote ${outPath} (${alignmentText.length} chars)`);
  }

  console.log('\nResolved audio URLs:');
  audioUrls.forEach((url, i) => {
    const status = matchedIndices.has(i) ? 'OK' : 'NO MATCHING TRANSCRIPT TEXT';
    console.log(`  [${i}] ${status.padEnd(28)} ${url}`);
  });

  // Machine-readable manifest for batch drivers -- avoids scraping stdout.
  const manifest = {
    recordingId,
    vanisourceUrl,
    audioUrls,
    matchedIndices: [...matchedIndices].sort((a, b) => a - b),
  };
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
}

main().catch((err) => {
  console.error(err?.message ?? String(err));
  process.exit(1);
});
