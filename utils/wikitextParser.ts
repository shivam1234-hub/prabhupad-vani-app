export interface TranscriptPart {
  title: string;
  text: string;
  audioUrl: string | null;
}

export interface TranscriptData {
  audioUrls: string[];
  parts: TranscriptPart[];
}

export function extractMp3Urls(wikitext: string): string[] {
  const urls: string[] = [];
  const re = /<mp3player>(https?:\/\/[^\s<]+)<\/mp3player>/gi;
  let m;
  while ((m = re.exec(wikitext)) !== null) urls.push(m[1].trim());
  return urls;
}

export function cleanWikitext(raw: string): string {
  return raw
    .replace(/\[\[Category:[^\]]*\]\]/g, '')
    .replace(/\[\[File:[^\]]*\]\]/g, '')
    .replace(/\{\{[^}]*\}\}/g, '')
    .replace(/<mp3player>[^<]*<\/mp3player>/gi, '')
    .replace(/<div[^>]*>[\s\S]*?<\/div>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/'''([^']+)'''/g, '$1')
    .replace(/''([^']+)''/g, '$1')
    .replace(/\[\[(?:[^|\]]+\|)?([^\]]+)\]\]/g, '$1')
    .replace(/={2,5}([^=]+)={2,5}/g, '\n\n── $1 ──\n')
    .replace(/^:+/gm, '   ')
    .replace(/^\*+/gm, ' •')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function buildParts(wikitext: string, audioUrls: string[]): TranscriptPart[] {
  const headerRe = /={2,5}([^=]+)={2,5}/g;
  const mp3Re = /<mp3player>(https?:\/\/[^\s<]+)<\/mp3player>/gi;

  const sectionSplits: Array<{ title: string; start: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = headerRe.exec(wikitext)) !== null) {
    sectionSplits.push({ title: m[1].trim(), start: m.index });
  }

  if (sectionSplits.length === 0) {
    return [{ title: 'Lecture', text: cleanWikitext(wikitext), audioUrl: audioUrls[0] ?? null }];
  }

  const mp3Positions: Array<{ url: string; index: number }> = [];
  let pm: RegExpExecArray | null;
  while ((pm = mp3Re.exec(wikitext)) !== null) {
    mp3Positions.push({ url: pm[1].trim(), index: pm.index });
  }

  const parts: TranscriptPart[] = [];
  for (let i = 0; i < sectionSplits.length; i++) {
    const sectionStart = sectionSplits[i].start;
    const sectionEnd = i + 1 < sectionSplits.length ? sectionSplits[i + 1].start : wikitext.length;
    const sectionText = wikitext.slice(sectionStart, sectionEnd);
    const sectionMp3 = mp3Positions.find(p => p.index >= sectionStart && p.index < sectionEnd);
    parts.push({
      title: sectionSplits[i].title,
      text: cleanWikitext(sectionText),
      audioUrl: sectionMp3?.url ?? null,
    });
  }

  const preText = cleanWikitext(wikitext.slice(0, sectionSplits[0].start)).trim();
  if (preText.length > 20) {
    parts.unshift({ title: 'Introduction', text: preText, audioUrl: null });
  }

  return parts.filter(p => p.text.length > 10);
}

export function parseWikitext(wikitext: string): TranscriptData {
  const audioUrls = extractMp3Urls(wikitext);
  const parts = buildParts(wikitext, audioUrls);
  return { audioUrls, parts };
}

// Matches TranscriptViewer.tsx's buildFlatLines speaker-label detection, e.g.
// "Prabhupada: ..." or "Devotee (Indian): ...".
const SPEAKER_RE = /^([A-Z][a-zA-Z]*(?:\s[A-Z][a-zA-Z]*)?(?:\s*\([^)]+\))?)\s*:\s*/;

/**
 * Reduces a cleaned transcript part's text down to what was actually spoken,
 * for use as forced-alignment ground truth. Strips markup that TranscriptViewer
 * renders but that has no corresponding audio (section headers, bullet markers,
 * speaker-name labels) while keeping sloka/verse lines, since those are chanted.
 */
export function toAlignmentText(partText: string): string {
  const lines = partText.split('\n');
  const spoken: string[] = [];
  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (/^──.+──$/.test(trimmed)) continue;
    let line = trimmed;
    if (line.startsWith('•')) line = line.slice(1).trim();
    const m = line.match(SPEAKER_RE);
    if (m) line = line.slice(m[0].length).trim();
    if (line) spoken.push(line);
  }
  return spoken.join(' ');
}
