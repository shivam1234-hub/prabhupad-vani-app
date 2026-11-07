// The TrackPlayer playback service is registered in index.js (the app entry
// point) so it also runs when Android relaunches only the headless media
// service after the app is killed — that's what keeps the notification
// play/pause controls working. Do NOT register it here: this module only
// evaluates when the UI mounts, so a headless restart would miss it.
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppState, AppStateStatus } from 'react-native';
import { useEffect, useRef } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AudioProvider, useAudioMeta, useAudioPosition } from '../contexts/AudioContext';
import { ThemeProvider, useTheme } from '../contexts/ThemeContext';
import { DownloadProvider } from '../contexts/DownloadContext';
import { LibraryProvider } from '../contexts/LibraryContext';
import { SettingsProvider } from '../contexts/SettingsContext';
import { HistoryProvider, useHistory } from '../contexts/HistoryContext';
import MiniPlayer from '../components/MiniPlayer';

// Saves playback position to history every 5 seconds while audio is playing.
// Uses the split hooks so we only re-render on meta changes (isPlaying,
// recording), never on the 2 Hz position tick — the tick data reaches us
// through refs updated by a tiny leaf child, keeping this parent stable so
// the AppState listener effect never re-registers unnecessarily.
function PositionTracker() {
  const audio = useAudioMeta();
  const { updatePosition } = useHistory();
  const audioRef = useRef(audio);
  audioRef.current = audio;
  const updateRef = useRef(updatePosition);
  updateRef.current = updatePosition;
  const positionRef = useRef({ positionMs: 0, durationMs: 0 });

  const saveNow = () => {
    const { recording } = audioRef.current;
    const { positionMs, durationMs } = positionRef.current;
    if (recording && positionMs > 5000) {
      updateRef.current(recording.pvId ?? recording.id, positionMs, durationMs);
    }
  };

  useEffect(() => {
    // Save every 5 seconds during playback
    const interval = setInterval(() => {
      if (audioRef.current.isPlaying) saveNow();
    }, 5000);

    // Also save immediately when app goes to background / is force-closed
    const appStateSub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'background' || state === 'inactive') saveNow();
    });

    return () => {
      clearInterval(interval);
      appStateSub.remove();
    };
  }, []);

  // Position is refreshed by this tiny child — it re-renders on every tick
  // but writes to a ref, so nothing else in the tree hears about it.
  return <PositionMirror positionRef={positionRef} />;
}

function PositionMirror({ positionRef }: { positionRef: React.MutableRefObject<{ positionMs: number; durationMs: number }> }) {
  const { positionMs, durationMs } = useAudioPosition();
  positionRef.current = { positionMs, durationMs };
  return null;
}

function AppNavigator() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.textPrimary,
        headerTitleStyle: { fontSize: 17, fontWeight: '600' },
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="lecture/[id]"
        options={{ title: 'Lecture', headerBackTitle: 'Back', presentation: 'card' }}
      />
      <Stack.Screen
        name="category/[slug]"
        options={{ headerBackTitle: 'Back', presentation: 'card' }}
      />
    </Stack>
  );
}

function ThemedStatusBar() {
  const { isDark } = useTheme();
  return <StatusBar style={isDark ? 'light' : 'dark'} />;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
        <SettingsProvider>
        <LibraryProvider>
        <HistoryProvider>
        <DownloadProvider>
        <AudioProvider>
          <ThemedStatusBar />
          <PositionTracker />
          <AppNavigator />
          <MiniPlayer />
        </AudioProvider>
        </DownloadProvider>
        </HistoryProvider>
        </LibraryProvider>
        </SettingsProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
