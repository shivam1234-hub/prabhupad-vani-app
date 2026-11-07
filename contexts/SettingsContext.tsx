import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useWindowDimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { READER_BASE_FONT_SIZE, WIDE_LAYOUT_BREAKPOINT } from '../utils/readerFont';

// Single font-size control, scoped to the lecture reading page only (hero,
// tags, details, actions, audio player, and the transcript body itself —
// sloka/translation/transcription). Deliberately does NOT touch any other
// screen (Home, Search, Downloads, History, tab bar) — the control lives on
// the Home screen for easy access, but only the lecture page's own text
// scales when it's adjusted.
const READER_FONT_LEVEL_KEY = 'settings_reader_font_level_v1';
const READER_FONT_SCALES = [0.85, 0.92, 1.0, 1.1, 1.22, 1.36, 1.5];
const AUTOPLAY_NEXT_KEY = 'settings_autoplay_next_v1';
const DEFAULT_READER_FONT_LEVEL = 2; // index into READER_FONT_SCALES => 1.0

export const READER_FONT_LEVEL_MIN = 0;
export const READER_FONT_LEVEL_MAX = READER_FONT_SCALES.length - 1;

// Reference pt size (at scale 1.0) purely so the stepper UI can show a
// concrete-feeling number ("14pt").
const BASE_READER_FONT = READER_BASE_FONT_SIZE;

// On a desktop window the same 14pt that reads well on a phone is far too
// small: the text sits in a much wider column and is viewed from further away.
// Widen the base so a default-sized desktop transcript is comfortable, while
// leaving every phone (narrower than the breakpoint) exactly as it was.
const WIDE_BASE_READER_FONT = 17;
export const DEFAULT_READER_FONT_SIZE = BASE_READER_FONT;
export const READER_FONT_SIZE_MIN = Math.round(BASE_READER_FONT * READER_FONT_SCALES[READER_FONT_LEVEL_MIN]);
export const READER_FONT_SIZE_MAX = Math.round(BASE_READER_FONT * READER_FONT_SCALES[READER_FONT_LEVEL_MAX]);

function clampReaderLevel(n: number): number {
  if (Number.isNaN(n)) return DEFAULT_READER_FONT_LEVEL;
  return Math.min(READER_FONT_LEVEL_MAX, Math.max(READER_FONT_LEVEL_MIN, Math.round(n)));
}

interface SettingsContextValue {
  /** Multiplier to apply to any base font size on the lecture page only. */
  readerFontScale: number;
  /** Same value expressed as a concrete pt size (for the stepper's "21pt" label). */
  readerFontSize: number;
  increaseReaderFontSize: () => void;
  decreaseReaderFontSize: () => void;
  resetReaderFontSize: () => void;
  /** When a lecture's last part ends, start the next one in the same section. */
  autoPlayNext: boolean;
  setAutoPlayNext: (on: boolean) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [readerFontLevel, setReaderFontLevel] = useState(DEFAULT_READER_FONT_LEVEL);

  useEffect(() => {
    AsyncStorage.getItem(READER_FONT_LEVEL_KEY).then((raw) => {
      if (raw == null) return;
      const parsed = parseInt(raw, 10);
      if (!Number.isNaN(parsed)) setReaderFontLevel(clampReaderLevel(parsed));
    }).catch(() => {});
  }, []);

  const [autoPlayNext, setAutoPlayNextState] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(AUTOPLAY_NEXT_KEY).then((raw) => {
      if (raw != null) setAutoPlayNextState(raw === '1');
    }).catch(() => {});
  }, []);

  const setAutoPlayNext = useCallback((on: boolean) => {
    setAutoPlayNextState(on);
    AsyncStorage.setItem(AUTOPLAY_NEXT_KEY, on ? '1' : '0').catch(() => {});
  }, []);

  const persist = useCallback((level: number) => {
    AsyncStorage.setItem(READER_FONT_LEVEL_KEY, String(level)).catch(() => {});
  }, []);

  const increaseReaderFontSize = useCallback(() => {
    setReaderFontLevel((prev) => {
      const next = clampReaderLevel(prev + 1);
      persist(next);
      return next;
    });
  }, [persist]);

  const decreaseReaderFontSize = useCallback(() => {
    setReaderFontLevel((prev) => {
      const next = clampReaderLevel(prev - 1);
      persist(next);
      return next;
    });
  }, [persist]);

  const resetReaderFontSize = useCallback(() => {
    setReaderFontLevel(DEFAULT_READER_FONT_LEVEL);
    persist(DEFAULT_READER_FONT_LEVEL);
  }, [persist]);

  const { width } = useWindowDimensions();
  const baseFont = width >= WIDE_LAYOUT_BREAKPOINT ? WIDE_BASE_READER_FONT : BASE_READER_FONT;

  const readerFontScale = READER_FONT_SCALES[readerFontLevel];
  const readerFontSize = Math.round(baseFont * readerFontScale);

  const value: SettingsContextValue = useMemo(() => ({
    readerFontScale,
    readerFontSize,
    increaseReaderFontSize,
    decreaseReaderFontSize,
    resetReaderFontSize,
    autoPlayNext,
    setAutoPlayNext,
  }), [
    readerFontScale, readerFontSize, increaseReaderFontSize, decreaseReaderFontSize, resetReaderFontSize,
    autoPlayNext, setAutoPlayNext,
  ]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
