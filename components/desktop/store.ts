import { useSyncExternalStore } from 'react';

/** Tiny external stores shared by the desktop shell and its pages. */
function createStore<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next: T) => { if (next === value) return; value = next; listeners.forEach(l => l()); },
    subscribe: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; },
  };
}

/** The global search query (top-bar field ⇄ Search page). */
export const searchQuery = createStore('');
export function useSearchQuery() {
  return useSyncExternalStore(searchQuery.subscribe, searchQuery.get, searchQuery.get);
}

/** Title the lecture page publishes for the top bar's breadcrumb. */
export const pageTitle = createStore<string>('');
export function usePageTitle() {
  return useSyncExternalStore(pageTitle.subscribe, pageTitle.get, pageTitle.get);
}
