import lecturesData from '../data/lectures.json';
import extraData from '../data/extra-recordings.json';
import { Recording } from '../data/types';

const lectures = lecturesData as Recording[];
const extra = extraData as Recording[];

export interface AllRecordingsResult {
  all: Recording[];
  byType: Record<string, Recording[]>;
  counts: Record<string, number>;
  categorySummary: Array<{ type: string; count: number }>;
  getById: (id: string) => Recording | undefined;
}

// The recordings JSON is ~1.6 MB / 50k entries. Sorting and indexing it took
// ~50-150 ms per lecture-screen mount when this was done inside the hook via
// useMemo, which showed up as "why does tapping a lecture feel sluggish now".
// The inputs are static bundled JSON, so the result is safe to cache at
// module scope and share across every screen for the whole app session.
let cached: AllRecordingsResult | null = null;

function build(): AllRecordingsResult {
  const merged = [...lectures, ...extra].sort((a, b) => {
    if (a.date < b.date) return -1;
    if (a.date > b.date) return 1;
    return 0;
  });

  const byType: Record<string, Recording[]> = {};
  const idMap = new Map<string, Recording>();
  for (const r of merged) {
    if (!byType[r.type]) byType[r.type] = [];
    byType[r.type].push(r);
    idMap.set(r.id, r);
    if (r.pvId) idMap.set(r.pvId, r);
  }

  const counts: Record<string, number> = {};
  for (const type of Object.keys(byType)) counts[type] = byType[type].length;

  const categorySummary = Object.entries(counts)
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  const getById = (id: string) => idMap.get(id);

  return { all: merged, byType, counts, categorySummary, getById };
}

export function useAllRecordings(): AllRecordingsResult {
  if (!cached) cached = build();
  return cached;
}
