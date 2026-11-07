import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const FAVOURITES_KEY = 'lib_favourites_v1';
const TAGS_KEY = 'lib_tags_v1';

interface LibraryContextValue {
  favourites: Set<string>;
  toggleFavourite: (id: string) => void;
  isFavourite: (id: string) => boolean;

  recordingTags: Record<string, string[]>;
  allTags: string[];
  addTag: (id: string, tag: string) => void;
  removeTag: (id: string, tag: string) => void;
  getTagsFor: (id: string) => string[];
  getRecordingIdsForTag: (tag: string) => string[];
  renameTag: (oldName: string, newName: string) => void;
  deleteTag: (name: string) => void;
}

const LibraryContext = createContext<LibraryContextValue | null>(null);

export function LibraryProvider({ children }: { children: React.ReactNode }) {
  const [favourites, setFavourites] = useState<Set<string>>(new Set());
  const [recordingTags, setRecordingTags] = useState<Record<string, string[]>>({});

  useEffect(() => {
    AsyncStorage.multiGet([FAVOURITES_KEY, TAGS_KEY]).then((pairs) => {
      const favsRaw = pairs[0][1];
      const tagsRaw = pairs[1][1];
      if (favsRaw) {
        try {
          setFavourites(new Set(JSON.parse(favsRaw) as string[]));
        } catch {}
      }
      if (tagsRaw) {
        try {
          setRecordingTags(JSON.parse(tagsRaw) as Record<string, string[]>);
        } catch {}
      }
    });
  }, []);

  const persistFavourites = useCallback((next: Set<string>) => {
    AsyncStorage.setItem(FAVOURITES_KEY, JSON.stringify([...next])).catch(() => {});
  }, []);

  const persistTags = useCallback((next: Record<string, string[]>) => {
    AsyncStorage.setItem(TAGS_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const toggleFavourite = useCallback((id: string) => {
    setFavourites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      persistFavourites(next);
      return next;
    });
  }, [persistFavourites]);

  const isFavourite = useCallback((id: string) => favourites.has(id), [favourites]);

  const addTag = useCallback((id: string, tag: string) => {
    setRecordingTags((prev) => {
      const current = prev[id] ?? [];
      if (current.includes(tag)) return prev;
      const next = { ...prev, [id]: [...current, tag] };
      persistTags(next);
      return next;
    });
  }, [persistTags]);

  const removeTag = useCallback((id: string, tag: string) => {
    setRecordingTags((prev) => {
      const current = prev[id];
      if (!current) return prev;
      const filtered = current.filter((t) => t !== tag);
      const next = { ...prev, [id]: filtered };
      persistTags(next);
      return next;
    });
  }, [persistTags]);

  const getTagsFor = useCallback((id: string) => recordingTags[id] ?? [], [recordingTags]);

  const getRecordingIdsForTag = useCallback(
    (tag: string) =>
      Object.entries(recordingTags)
        .filter(([, tags]) => tags.includes(tag))
        .map(([id]) => id),
    [recordingTags],
  );

  const renameTag = useCallback((oldName: string, newName: string) => {
    if (oldName === newName) return;
    setRecordingTags((prev) => {
      const next: Record<string, string[]> = {};
      for (const [id, tags] of Object.entries(prev)) {
        next[id] = tags.map((t) => (t === oldName ? newName : t));
      }
      persistTags(next);
      return next;
    });
  }, [persistTags]);

  const deleteTag = useCallback((name: string) => {
    setRecordingTags((prev) => {
      const next: Record<string, string[]> = {};
      for (const [id, tags] of Object.entries(prev)) {
        next[id] = tags.filter((t) => t !== name);
      }
      persistTags(next);
      return next;
    });
  }, [persistTags]);

  const allTags = useMemo<string[]>(() => {
    const set = new Set<string>();
    for (const tags of Object.values(recordingTags)) {
      for (const tag of tags) {
        set.add(tag);
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [recordingTags]);

  const value: LibraryContextValue = {
    favourites,
    toggleFavourite,
    isFavourite,
    recordingTags,
    allTags,
    addTag,
    removeTag,
    getTagsFor,
    getRecordingIdsForTag,
    renameTag,
    deleteTag,
  };

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary(): LibraryContextValue {
  const ctx = useContext(LibraryContext);
  if (!ctx) throw new Error('useLibrary must be used within LibraryProvider');
  return ctx;
}
