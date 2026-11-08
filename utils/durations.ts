import type { Recording } from '../data/types';

/**
 * Lecture lengths in seconds, keyed by vanisource page title. Built offline by
 * scripts/build-durations.py (reads each mp3's size and header; nothing is
 * downloaded at runtime). Multi-part lectures are the sum of their parts.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const DURATIONS: Record<string, number> = require('../data/durations.json');

export function durationSec(r: Pick<Recording, 'vanisourceUrl'>): number | undefined {
  const raw = r.vanisourceUrl?.split('/wiki/')[1];
  if (!raw) return undefined;
  let key = raw;
  try { key = decodeURIComponent(raw); } catch {}
  return DURATIONS[key.replace(/ /g, '_')];
}

/** "1:05:30" / "32:10" */
export function formatDuration(sec: number): string {
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
