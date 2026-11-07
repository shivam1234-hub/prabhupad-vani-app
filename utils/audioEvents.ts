type PlayEvent = { id: string; title: string; type: string; positionMs: number; durationMs: number };
type Listener = (e: PlayEvent) => void;
const listeners: Listener[] = [];
/** Autoplay moved on from one lecture to the next (ids as in getRecordingId). */
type AdvanceEvent = { fromId: string; toId: string };
type AdvanceListener = (e: AdvanceEvent) => void;
const advanceListeners: AdvanceListener[] = [];
export const audioEvents = {
  emitPlay: (e: PlayEvent) => listeners.forEach(l => l(e)),
  onPlay: (l: Listener) => {
    listeners.push(l);
    return () => {
      const i = listeners.indexOf(l);
      if (i >= 0) listeners.splice(i, 1);
    };
  },
  emitAutoAdvance: (e: AdvanceEvent) => advanceListeners.forEach(l => l(e)),
  onAutoAdvance: (l: AdvanceListener) => {
    advanceListeners.push(l);
    return () => {
      const i = advanceListeners.indexOf(l);
      if (i >= 0) advanceListeners.splice(i, 1);
    };
  },
};
