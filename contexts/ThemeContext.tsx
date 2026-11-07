import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeColors, ThemeMode, darkColors, lightColors } from '../theme/palette';

/**
 * Light/dark theming for the whole app.
 *
 * Three modes: 'system' (default) follows the OS, 'light' and 'dark' pin it.
 * The choice persists, and `useColorScheme()` keeps 'system' live — flipping
 * Windows or Android to dark mode re-themes the app without a restart.
 *
 * Screens consume this through {@link useThemeColors} and build their
 * StyleSheet from it, rather than reading hard-coded hex. See theme/palette.ts
 * for why the tokens are named by role.
 */

const THEME_MODE_KEY = 'settings_theme_mode_v1';

interface ThemeContextValue {
  /** What the user picked — may be 'system'. */
  mode: ThemeMode;
  /** What that actually resolves to right now. Never 'system'. */
  scheme: 'light' | 'dark';
  colors: ThemeColors;
  isDark: boolean;
  setMode: (mode: ThemeMode) => void;
  /** Flip to the opposite of whatever is on screen, leaving 'system' behind. */
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    AsyncStorage.getItem(THEME_MODE_KEY)
      .then((raw) => { if (isThemeMode(raw)) setModeState(raw); })
      .catch(() => {});
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    AsyncStorage.setItem(THEME_MODE_KEY, next).catch(() => {});
  }, []);

  // useColorScheme() returns null before the OS preference is known (and in
  // some web contexts); dark is the app's historical look, so fall back to it
  // rather than flashing a light screen and correcting a frame later.
  const scheme: 'light' | 'dark' =
    mode === 'system' ? (systemScheme === 'light' ? 'light' : 'dark') : mode;

  const toggle = useCallback(() => {
    setMode(scheme === 'dark' ? 'light' : 'dark');
  }, [scheme, setMode]);

  const value = useMemo<ThemeContextValue>(() => ({
    mode,
    scheme,
    colors: scheme === 'dark' ? darkColors : lightColors,
    isDark: scheme === 'dark',
    setMode,
    toggle,
  }), [mode, scheme, setMode, toggle]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

/** Shorthand for the common case — just the colours. */
export function useThemeColors(): ThemeColors {
  return useTheme().colors;
}

export type { ThemeColors, ThemeMode };
