import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { audioEvents } from '../utils/audioEvents';

const HISTORY_KEY = 'play_history_v1';
const SETTINGS_KEY = 'history_settings_v1';

export type HistoryRetention = 7 | 30 | 90 | -1; // -1 = forever

export interface HistoryEntry {
  id: string;
  title: string;
  type: string;
  playedAt: string; // ISO
  positionMs: number;
  durationMs: number;
}

export interface HistorySettings {
  retention: HistoryRetention;
}

interface HistoryContextValue {
  history: HistoryEntry[];
  /** id (pvId ?? id) -> most recent HistoryEntry, for O(1) "is this watched?" lookups in lists. */
  historyMap: Map<string, HistoryEntry>;
  settings: HistorySettings;
  recordPlay: (entry: Omit<HistoryEntry, 'playedAt'>) => void;
  updatePosition: (id: string, positionMs: number, durationMs: number) => void;
  clearHistory: () => void;
  updateSettings: (s: Partial<HistorySettings>) => void;
  /** Most recently played entry whose `type` matches, or undefined if none. History is kept ordered by recency. */
  getMostRecentForType: (type: string) => HistoryEntry | undefined;
}

const HistoryContext = createContext<HistoryContextValue | null>(null);

export function HistoryProvider({ children }: { children: React.ReactNode }) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [settings, setSettings] = useState<HistorySettings>({ retention: 30 });

  useEffect(() => {
    async function load() {
      const [rawHistory, rawSettings] = await Promise.all([
        AsyncStorage.getItem(HISTORY_KEY),
        AsyncStorage.getItem(SETTINGS_KEY),
      ]);
      if (rawHistory) {
        try { setHistory(JSON.parse(rawHistory)); } catch {}
      }
      if (rawSettings) {
        try { setSettings(JSON.parse(rawSettings)); } catch {}
      }
    }
    load();
  }, []);

  const pruneHistory = useCallback((entries: HistoryEntry[], retention: HistoryRetention): HistoryEntry[] => {
    if (retention === -1) return entries;
    const cutoff = Date.now() - retention * 24 * 60 * 60 * 1000;
    return entries.filter(e => new Date(e.playedAt).getTime() > cutoff);
  }, []);

  const recordPlay = useCallback((entry: Omit<HistoryEntry, 'playedAt'>) => {
    setHistory(prev => {
      const existing = prev.find(e => e.id === entry.id);
      const filtered = prev.filter(e => e.id !== entry.id);
      const newEntry: HistoryEntry = {
        ...entry,
        playedAt: new Date().toISOString(),
        // Preserve saved position/duration — PositionTracker updates them during playback.
        // Without this, starting playback would overwrite a saved position with 0.
        positionMs: existing?.positionMs ?? 0,
        durationMs: existing?.durationMs ?? 0,
      };
      const next = [newEntry, ...filtered].slice(0, 500);
      const pruned = pruneHistory(next, settings.retention);
      AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(pruned));
      return pruned;
    });
  }, [settings.retention, pruneHistory]);

  const updatePosition = useCallback((id: string, positionMs: number, durationMs: number) => {
    setHistory(prev => {
      const idx = prev.findIndex(e => e.id === id);
      if (idx === -1) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx], positionMs, durationMs };
      AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    AsyncStorage.removeItem(HISTORY_KEY);
  }, []);

  const updateSettings = useCallback((s: Partial<HistorySettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...s };
      AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  useEffect(() => {
    return audioEvents.onPlay(e => recordPlay(e));
  }, [recordPlay]);

  const historyMap = useMemo(() => {
    const map = new Map<string, HistoryEntry>();
    // history is newest-first; only keep the first (most recent) entry per id.
    for (const entry of history) {
      if (!map.has(entry.id)) map.set(entry.id, entry);
    }
    return map;
  }, [history]);

  const getMostRecentForType = useCallback((type: string) => {
    return history.find(e => e.type === type);
  }, [history]);

  return (
    <HistoryContext.Provider value={{
      history, historyMap, settings, recordPlay, updatePosition, clearHistory, updateSettings, getMostRecentForType,
    }}>
      {children}
    </HistoryContext.Provider>
  );
}

export function useHistory() {
  const ctx = useContext(HistoryContext);
  if (!ctx) throw new Error('useHistory must be used within HistoryProvider');
  return ctx;
}
