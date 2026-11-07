import React, {
  createContext, useCallback, useContext, useEffect, useState,
} from 'react';

/**
 * Desktop/web build of the download store.
 *
 * `DownloadContext.tsx` drives expo-file-system directly from the renderer,
 * which a browser cannot do — `documentDirectory` is null on web, so every
 * path there resolves to "nullaudio/…" and the whole Downloads tab quietly
 * does nothing. On Windows the real engine lives in the Electron main process
 * (desktop/lib/downloads.js) and this file is a mirror of its state over IPC.
 *
 * Metro resolves `.web.tsx` ahead of `.tsx`, so native keeps expo-file-system
 * and neither platform sees the other's implementation. The exported shape is
 * identical to the native file's, so app/(tabs)/downloads.tsx,
 * app/lecture/[id].tsx, browse.tsx and TranscriptViewer all work unmodified.
 *
 * Opened in a plain browser — no `window.desktop` — this degrades to an empty,
 * inert store rather than throwing, which keeps `expo start --web` usable for
 * previewing the UI.
 */

export interface DownloadEntry {
  localUris: string[];
  totalBytes: number;
  downloadedAt: string;
}

export interface DownloadProgress {
  status: 'fetching' | 'downloading' | 'error';
  partsDone: number;
  totalParts: number;
  bytesWritten: number;
  bytesTotal: number;
}

export interface DownloadContextValue {
  registry: Record<string, DownloadEntry>;
  progress: Record<string, DownloadProgress>;
  downloadRecording: (id: string, vanisourceUrl: string) => Promise<void>;
  downloadBatch: (items: Array<{ id: string; vanisourceUrl: string }>) => void;
  cancelDownload: (id: string) => void;
  deleteDownload: (id: string) => Promise<void>;
  deleteAll: () => Promise<void>;
  isDownloaded: (id: string) => boolean;
  getLocalUris: (id: string) => string[];
  totalBytes: number;
  totalCount: number;
}

interface DesktopDownloadsBridge {
  getState: () => Promise<{
    registry: Record<string, DownloadEntry>;
    progress: Record<string, DownloadProgress>;
  }>;
  download: (id: string, vanisourceUrl: string) => Promise<void>;
  batch: (items: Array<{ id: string; vanisourceUrl: string }>) => Promise<void>;
  cancel: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  removeAll: () => Promise<void>;
  openFolder: () => Promise<void>;
  onRegistry: (cb: (registry: Record<string, DownloadEntry>) => void) => () => void;
  onProgress: (cb: (progress: Record<string, DownloadProgress>) => void) => () => void;
}

function bridge(): DesktopDownloadsBridge | null {
  if (typeof window === 'undefined') return null;
  return (window as any).desktop?.downloads ?? null;
}

/** True when running inside the Electron shell rather than a plain browser. */
export const isDesktopBuild = typeof window !== 'undefined' && Boolean((window as any).desktop);

const DownloadContext = createContext<DownloadContextValue | null>(null);

export function DownloadProvider({ children }: { children: React.ReactNode }) {
  const [registry, setRegistry] = useState<Record<string, DownloadEntry>>({});
  const [progress, setProgress] = useState<Record<string, DownloadProgress>>({});

  useEffect(() => {
    const api = bridge();
    if (!api) return;

    let cancelled = false;

    // One snapshot on mount, then live updates. The main process has already
    // reconciled the registry against what is on disk by this point, so a
    // reinstall that left the audio folder behind shows its downloads again.
    api.getState().then((state) => {
      if (cancelled) return;
      setRegistry(state.registry ?? {});
      setProgress(state.progress ?? {});
    }).catch(() => {});

    const offRegistry = api.onRegistry((next) => setRegistry(next ?? {}));
    const offProgress = api.onProgress((next) => setProgress(next ?? {}));

    return () => {
      cancelled = true;
      offRegistry();
      offProgress();
    };
  }, []);

  const downloadRecording = useCallback(async (id: string, vanisourceUrl: string) => {
    await bridge()?.download(id, vanisourceUrl);
  }, []);

  const downloadBatch = useCallback((items: Array<{ id: string; vanisourceUrl: string }>) => {
    bridge()?.batch(items);
  }, []);

  const cancelDownload = useCallback((id: string) => {
    bridge()?.cancel(id);
  }, []);

  const deleteDownload = useCallback(async (id: string) => {
    await bridge()?.remove(id);
  }, []);

  const deleteAll = useCallback(async () => {
    await bridge()?.removeAll();
  }, []);

  const isDownloaded = useCallback((id: string) => id in registry, [registry]);
  const getLocalUris = useCallback((id: string) => registry[id]?.localUris ?? [], [registry]);

  const totalBytes = Object.values(registry).reduce((sum, e) => sum + e.totalBytes, 0);
  const totalCount = Object.keys(registry).length;

  return (
    <DownloadContext.Provider value={{
      registry, progress,
      downloadRecording, downloadBatch, cancelDownload,
      deleteDownload, deleteAll,
      isDownloaded, getLocalUris,
      totalBytes, totalCount,
    }}>
      {children}
    </DownloadContext.Provider>
  );
}

export function useDownload(): DownloadContextValue {
  const ctx = useContext(DownloadContext);
  if (!ctx) throw new Error('useDownload must be used within DownloadProvider');
  return ctx;
}

/** Reveal the downloaded-audio folder in Explorer. No-op outside the desktop build. */
export function openDownloadsFolder(): void {
  bridge()?.openFolder();
}
