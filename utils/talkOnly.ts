import AsyncStorage from '@react-native-async-storage/async-storage';
import { TALK, type TalkData } from '../data/talkManifest';

/**
 * "Prabhupāda only" listening: while on, playback skips everything that is not
 * Srila Prabhupāda speaking — the opening śloka chanting, the synonyms and
 * translation read by a devotee, devotees' questions, kirtan and long breaks.
 *
 * The keep-ranges come from scripts/talk_segments.py (forced alignment of the
 * vanisource transcript, whose paragraphs name the speaker). Only lectures in
 * data/talkManifest.ts have them; everything else plays normally.
 *
 * The skipping itself runs in service.ts on the player's progress events, so
 * it keeps working with the screen off. This module is the shared state.
 */

const KEY = 'talk_only_v1';
let enabled = false;
let loaded = false;
const listeners = new Set<(on: boolean) => void>();
const cache = new Map<string, TalkData | null>();

export async function loadTalkOnly(): Promise<boolean> {
  if (!loaded) {
    loaded = true;
    try { enabled = (await AsyncStorage.getItem(KEY)) === '1'; } catch {}
    listeners.forEach(l => l(enabled));
  }
  return enabled;
}

export function isTalkOnly() { return enabled; }

export function setTalkOnly(on: boolean) {
  enabled = on;
  loaded = true;
  AsyncStorage.setItem(KEY, on ? '1' : '0').catch(() => {});
  listeners.forEach(l => l(on));
}

export function onTalkOnlyChange(cb: (on: boolean) => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function getTalk(recordingId: string | undefined | null): TalkData | null {
  if (!recordingId) return null;
  if (!cache.has(recordingId)) {
    const load = TALK[recordingId];
    let data: TalkData | null = null;
    try { data = load ? load() : null; } catch {}
    cache.set(recordingId, data);
  }
  return cache.get(recordingId)!;
}

export type SkipAction =
  | { kind: 'none' }
  | { kind: 'seek'; to: number }
  | { kind: 'nextPart' }
  | { kind: 'end' };

/**
 * Where to go from `position` (seconds) in part `partIndex`. Inside a kept
 * range (or a lecture/part with no data): stay. Before a kept range: jump to
 * its start. After the last one: next part, or the end of the lecture.
 */
export function skipFor(data: TalkData, partIndex: number, position: number, hasNextPart: boolean): SkipAction {
  const ranges = data.parts[String(partIndex)];
  if (!ranges) return { kind: 'none' };          // part not analysed: play it as is
  for (const [s, e] of ranges) {
    if (position < s - 0.5) return { kind: 'seek', to: s };
    if (position <= e) return { kind: 'none' };
  }
  return hasNextPart ? { kind: 'nextPart' } : { kind: 'end' };
}
