import { Recording, getRecordingId } from '../data/types';
import { useAllRecordings } from '../hooks/useAllRecordings';
import { sortRecordings } from '../hooks/useSearch';

// "Next" follows the order the section's own screen shows by default. Verse
// commentaries (BG 02.11 → BG 02.12, SB, CC, BS) go in verse sequence;
// sections whose titles carry no verse number (Conversations, Morning Walks,
// Initiations …) go by date. `byType` is already date-sorted, and the
// sequence sort is stable, so lectures on the same verse stay in date order.
// Indexed by object first: 48 `id`s repeat across the data, but the recording
// handed to play() is normally the very object from the bundled JSON.
const orderCache = new Map<string, {
  list: Recording[];
  indexByObj: Map<Recording, number>;
  indexById: Map<string, number>;
}>();

function sectionOrder(type: string) {
  let entry = orderCache.get(type);
  if (entry) return entry;
  // Plain function despite the name — it only reads a module-level cache.
  const section = useAllRecordings().byType[type] ?? [];
  const numbered = section.filter(r => /\d+\.\d+/.test(r.title)).length;
  const list = numbered * 2 > section.length ? sortRecordings(section, 'sequence') : section;
  const indexByObj = new Map<Recording, number>();
  const indexById = new Map<string, number>();
  list.forEach((r, i) => {
    indexByObj.set(r, i);
    if (!indexById.has(r.id)) indexById.set(r.id, i);
  });
  entry = { list, indexByObj, indexById };
  orderCache.set(type, entry);
  return entry;
}

/**
 * The recordings that follow `current` within its section, nearest first.
 * Entries sharing `current`'s id (the duplicated pvIds in lectures.json) are
 * skipped so autoplay never "advances" to the lecture that just ended.
 */
export function upcomingInSection(current: Recording, limit = 5): Recording[] {
  const { list, indexByObj, indexById } = sectionOrder(current.type);
  const idx = indexByObj.get(current) ?? indexById.get(current.id);
  if (idx == null) return [];
  const currentId = getRecordingId(current);
  const out: Recording[] = [];
  for (let i = idx + 1; i < list.length && out.length < limit; i++) {
    if (getRecordingId(list[i]) !== currentId) out.push(list[i]);
  }
  return out;
}

export function nextInSection(current: Recording): Recording | null {
  return upcomingInSection(current, 1)[0] ?? null;
}
