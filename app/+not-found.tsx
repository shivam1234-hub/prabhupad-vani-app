import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { View, ActivityIndicator, Platform } from 'react-native';
import { useThemeColors } from '../contexts/ThemeContext';

export default function NotFoundScreen() {
  const c = useThemeColors();
  const router = useRouter();

  useEffect(() => {
    async function redirect() {
      try {
        // require()'d lazily and skipped on web — see index.js for why.
        if (Platform.OS !== 'web') {
          const TrackPlayer = require('react-native-track-player').default;
          const track = await TrackPlayer.getActiveTrack();
          if (track?.id) {
            router.replace(`/lecture/${track.id}`);
            return;
          }
        }
      } catch {}
      router.replace('/');
    }
    redirect();
  }, []);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#FF7722" />
      </View>
    </>
  );
}
