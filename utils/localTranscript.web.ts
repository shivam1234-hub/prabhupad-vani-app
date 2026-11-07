/**
 * Web/desktop counterpart of localTranscript.ts.
 *
 * A browser has no filesystem, so on Windows the downloaded transcript is read
 * by the Electron main process and handed back over the preload bridge. In a
 * plain browser there are no downloads at all, so this always returns null and
 * `useTranscript` falls through to its AsyncStorage cache and the network —
 * exactly what it did before downloads existed on this platform.
 */
export async function readLocalTranscript(recordingId: string): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  const downloads = (window as any).desktop?.downloads;
  if (typeof downloads?.readTranscript !== 'function') return null;
  try {
    return (await downloads.readTranscript(recordingId)) ?? null;
  } catch {
    return null;
  }
}

/**
 * Back-fill counterpart of localTranscript.ts's writeLocalTranscript. If the
 * Electron preload bridge exposes it, use it; otherwise (plain browser) do
 * nothing — there was no local file to back-fill in the first place.
 */
export async function writeLocalTranscript(_recordingId: string, _wikitext: string): Promise<void> {
  if (typeof window === 'undefined') return;
  const downloads = (window as any).desktop?.downloads;
  if (typeof downloads?.writeTranscript !== 'function') return;
  try { await downloads.writeTranscript(_recordingId, _wikitext); } catch {}
}
