import { useSyncExternalStore } from 'react';

/**
 * "Transcript only" reading mode, set by the lecture screen.
 *
 * It lives outside React context because the one other reader is MiniPlayer,
 * which is mounted at the root beside the navigator (app/_layout.tsx) — above
 * any provider the lecture screen could supply. A tiny external store lets it
 * hide itself without threading a provider through the whole tree.
 */
let focused = false;
const listeners = new Set<() => void>();

export function setFocusMode(next: boolean) {
  if (next === focused) return;
  focused = next;
  listeners.forEach(l => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export function useFocusMode(): boolean {
  return useSyncExternalStore(subscribe, () => focused, () => focused);
}
