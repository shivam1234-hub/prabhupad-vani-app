/**
 * Desktop-only access to the single <audio> element that
 * contexts/AudioContext.web.tsx plays through. The shared AudioContext API has
 * no volume (phones use the hardware buttons), but the desktop now-playing bar
 * has a volume slider, so it reaches the element through here.
 */
const VOLUME_KEY = 'pv_desktop_volume_v1';
let element: HTMLAudioElement | null = null;
const listeners = new Set<() => void>();

export function registerAudioElement(el: HTMLAudioElement) {
  element = el;
  try {
    const v = Number(globalThis.localStorage?.getItem(VOLUME_KEY));
    if (Number.isFinite(v) && v >= 0 && v <= 1 && globalThis.localStorage?.getItem(VOLUME_KEY) != null) el.volume = v;
  } catch {}
  el.addEventListener('volumechange', () => listeners.forEach(l => l()));
}

export function getVolume(): number {
  return element ? (element.muted ? 0 : element.volume) : 1;
}

export function setVolume(v: number) {
  if (!element) return;
  const next = Math.max(0, Math.min(1, v));
  element.muted = false;
  element.volume = next;
  try { globalThis.localStorage?.setItem(VOLUME_KEY, String(next)); } catch {}
}

export function subscribeVolume(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}
