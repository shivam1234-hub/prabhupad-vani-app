import React, {
  createContext, useCallback, useContext, useEffect, useRef, useState,
} from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';

const REGISTRY_KEY = 'dl_registry_v1';
const AUDIO_DIR = FileSystem.documentDirectory + 'audio/';
const MAX_CONCURRENT = 3;

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

const DownloadContext = createContext<DownloadContextValue | null>(null);

function localUri(recordingId: string, partIndex: number): string {
  return `${AUDIO_DIR}${recordingId}/part-${partIndex}.mp3`;
}

const NO_AUDIO = 'NO_AUDIO'; // sentinel — not a network error, skip silently in batch

async function fetchWikitext(vanisourceUrl: string): Promise<string> {
  const pageTitle = decodeURIComponent(vanisourceUrl.split('/wiki/').pop() ?? '');
  const { Platform } = require('react-native');
  const apiUrl =
    `https://vanisource.org/w/api.php?action=parse&page=${encodeURIComponent(pageTitle)}&prop=wikitext&format=json` +
    (Platform.OS !== 'web' ? '&origin=*' : '');

  // 3 attempts with back-off for transient network errors
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(apiUrl);
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const json = await res.json();
      return json?.parse?.wikitext?.['*'] ?? '';
    } catch (e: any) {
      if (attempt < 2) await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
      else throw e;
    }
  }
  throw new Error('Failed after 3 attempts');
}

async function fetchAudioUrls(vanisourceUrl: string): Promise<{ urls: string[]; wikitext: string }> {
  const wikitext = await fetchWikitext(vanisourceUrl);
  const matches = [...wikitext.matchAll(/<mp3player>(.*?)<\/mp3player>/g)];
  const urls = matches.map(m => m[1].trim()).filter(Boolean);
  if (urls.length === 0) throw new Error(NO_AUDIO);
  return { urls, wikitext };
}

export function DownloadProvider({ children }: { children: React.ReactNode }) {
  const [registry, setRegistry] = useState<Record<string, DownloadEntry>>({});
  const [progress, setProgress] = useState<Record<string, DownloadProgress>>({});

  const cancelledRef = useRef<Set<string>>(new Set());
  const activeCountRef = useRef(0);
  const queueRef = useRef<Array<{ id: string; vanisourceUrl: string }>>([]);
  const processingRef = useRef(false);

  useEffect(() => {
    async function loadRegistry() {
      // Load whatever is saved in AsyncStorage
      let savedRegistry: Record<string, DownloadEntry> = {};
      const raw = await AsyncStorage.getItem(REGISTRY_KEY);
      if (raw) {
        try { savedRegistry = JSON.parse(raw) ?? {}; } catch {}
      }

      // Always reconcile against the filesystem so that downloads re-appear
      // after a reinstall where the app data was cleared but files survived.
      // Also removes stale registry entries whose files were deleted.
      try {
        const dirInfo = await FileSystem.getInfoAsync(AUDIO_DIR);
        if (!dirInfo.exists) {
          if (Object.keys(savedRegistry).length > 0) setRegistry(savedRegistry);
          return;
        }
        const entries = await FileSystem.readDirectoryAsync(AUDIO_DIR);
        const merged: Record<string, DownloadEntry> = {};
        for (const entry of entries) {
          try {
            const dirPath = `${AUDIO_DIR}${entry}/`;
            const files = await FileSystem.readDirectoryAsync(dirPath);
            const audioFiles = files.filter(f => f.endsWith('.mp3')).sort();
            if (audioFiles.length === 0) continue;
            const uris = audioFiles.map(f => `${dirPath}${f}`);
            if (savedRegistry[entry]) {
              // File confirmed on disk — reuse saved metadata, refresh URIs
              merged[entry] = { ...savedRegistry[entry], localUris: uris };
            } else {
              // File on disk but not in registry (e.g. after reinstall)
              let totalBytes = 0;
              for (const uri of uris) {
                const info = await FileSystem.getInfoAsync(uri);
                if (info.exists && 'size' in info) totalBytes += info.size ?? 0;
              }
              merged[entry] = { localUris: uris, totalBytes, downloadedAt: new Date().toISOString() };
            }
          } catch {}
        }
        setRegistry(merged);
        await AsyncStorage.setItem(REGISTRY_KEY, JSON.stringify(merged));
      } catch {
        // Filesystem scan failed — fall back to whatever AsyncStorage had
        if (Object.keys(savedRegistry).length > 0) setRegistry(savedRegistry);
      }
    }
    loadRegistry();
  }, []);

  const persistRegistry = useCallback(async (next: Record<string, DownloadEntry>) => {
    setRegistry(next);
    await AsyncStorage.setItem(REGISTRY_KEY, JSON.stringify(next));
  }, []);

  const clearProgress = useCallback((id: string) => {
    setProgress(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const downloadRecording = useCallback(async (id: string, vanisourceUrl: string) => {
    cancelledRef.current.delete(id);

    setProgress(prev => ({
      ...prev,
      [id]: { status: 'fetching', partsDone: 0, totalParts: 0, bytesWritten: 0, bytesTotal: 0 },
    }));

    let audioUrls: string[];
    let wikitext: string | undefined;
    try {
      ({ urls: audioUrls, wikitext } = await fetchAudioUrls(vanisourceUrl));
    } catch (e: any) {
      if (e.message === NO_AUDIO) {
        // Recording has no audio on Vanisource — silently skip, don't show as error
        clearProgress(id);
      } else {
        setProgress(prev => ({
          ...prev,
          [id]: { status: 'error', partsDone: 0, totalParts: 0, bytesWritten: 0, bytesTotal: 0 },
        }));
      }
      return;
    }

    if (cancelledRef.current.has(id)) { clearProgress(id); return; }

    const totalParts = audioUrls.length;
    await FileSystem.makeDirectoryAsync(`${AUDIO_DIR}${id}/`, { intermediates: true });
    if (wikitext) {
      await FileSystem.writeAsStringAsync(`${AUDIO_DIR}${id}/transcript.json`, JSON.stringify({ wikitext })).catch(() => {});
    }

    // Per-part byte tracking for aggregated progress
    const partWritten = new Array<number>(totalParts).fill(0);
    const partTotal = new Array<number>(totalParts).fill(0);
    const localUris = new Array<string | null>(totalParts).fill(null);

    setProgress(prev => ({
      ...prev,
      [id]: { status: 'downloading', partsDone: 0, totalParts, bytesWritten: 0, bytesTotal: 0 },
    }));

    const pushProgress = () => {
      setProgress(prev => ({
        ...prev,
        [id]: {
          status: 'downloading',
          partsDone: localUris.filter(Boolean).length,
          totalParts,
          bytesWritten: partWritten.reduce((a, b) => a + b, 0),
          bytesTotal: partTotal.reduce((a, b) => a + b, 0),
        },
      }));
    };

    // Download all parts in parallel with retry
    const downloadPart = async (url: string, i: number): Promise<boolean> => {
      const dest = localUri(id, i);
      for (let attempt = 0; attempt < 3; attempt++) {
        if (cancelledRef.current.has(id)) return false;
        try {
          // Delete partial file from previous attempt
          const existing = await FileSystem.getInfoAsync(dest);
          if (existing.exists) await FileSystem.deleteAsync(dest, { idempotent: true });

          const dl = FileSystem.createDownloadResumable(
            url,
            dest,
            {},
            (dp) => {
              partWritten[i] = dp.totalBytesWritten;
              partTotal[i] = dp.totalBytesExpectedToWrite;
              pushProgress();
            },
          );
          const result = await dl.downloadAsync();
          if (!result) {
            if (attempt < 2) await new Promise(r => setTimeout(r, 2000));
            continue;
          }
          if (cancelledRef.current.has(id)) return false;
          localUris[i] = dest;
          pushProgress();
          return true;
        } catch {
          if (attempt < 2) await new Promise(r => setTimeout(r, 2000));
        }
      }
      return false;
    };

    const results = await Promise.all(audioUrls.map((url, i) => downloadPart(url, i)));

    if (cancelledRef.current.has(id)) { clearProgress(id); return; }

    if (!results.every(Boolean)) {
      setProgress(prev => ({
        ...prev,
        [id]: { status: 'error', partsDone: 0, totalParts, bytesWritten: 0, bytesTotal: 0 },
      }));
      return;
    }

    const validUris = localUris.filter((u): u is string => u !== null);
    let totalBytes = 0;
    for (const uri of validUris) {
      const info = await FileSystem.getInfoAsync(uri);
      if (info.exists && 'size' in info) totalBytes += info.size ?? 0;
    }

    setRegistry(prev => {
      const next = { ...prev, [id]: { localUris: validUris, totalBytes, downloadedAt: new Date().toISOString() } };
      AsyncStorage.setItem(REGISTRY_KEY, JSON.stringify(next));
      return next;
    });

    clearProgress(id);
  }, [clearProgress]);

  const processQueue = useCallback(() => {
    if (processingRef.current) return;
    processingRef.current = true;

    const tick = () => {
      while (activeCountRef.current < MAX_CONCURRENT && queueRef.current.length > 0) {
        const item = queueRef.current.shift()!;
        if (cancelledRef.current.has(item.id)) continue;
        activeCountRef.current += 1;
        downloadRecording(item.id, item.vanisourceUrl).finally(() => {
          activeCountRef.current -= 1;
          tick();
        });
      }
      if (queueRef.current.length === 0 && activeCountRef.current === 0) {
        processingRef.current = false;
      }
    };

    tick();
  }, [downloadRecording]);

  const downloadBatch = useCallback(
    (items: Array<{ id: string; vanisourceUrl: string }>) => {
      for (const item of items) {
        // Allow re-queuing items that previously errored
        cancelledRef.current.delete(item.id);
        if (!queueRef.current.some(q => q.id === item.id)) {
          queueRef.current.push(item);
        }
      }
      processQueue();
    },
    [processQueue],
  );

  const cancelDownload = useCallback((id: string) => {
    cancelledRef.current.add(id);
    queueRef.current = queueRef.current.filter(q => q.id !== id);
    clearProgress(id);
  }, [clearProgress]);

  const deleteDownload = useCallback(async (id: string) => {
    const dirUri = `${AUDIO_DIR}${id}/`;
    const info = await FileSystem.getInfoAsync(dirUri);
    if (info.exists) await FileSystem.deleteAsync(dirUri, { idempotent: true });
    setRegistry(prev => {
      const next = { ...prev };
      delete next[id];
      AsyncStorage.setItem(REGISTRY_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const deleteAll = useCallback(async () => {
    const info = await FileSystem.getInfoAsync(AUDIO_DIR);
    if (info.exists) await FileSystem.deleteAsync(AUDIO_DIR, { idempotent: true });
    await persistRegistry({});
  }, [persistRegistry]);

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
