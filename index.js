// Register the TrackPlayer background service before React Native starts.
// This must live in the entry module (package.json "main": "index.js") so it
// also runs when Android relaunches only the headless media service after the
// app is killed — that's what keeps the notification play/pause controls alive.
// service.ts uses `export default`, so grab `.default` off the module.
//
// Skipped on web: react-native-track-player's web shim is broken in the
// installed alpha version (its Capability/State enums unconditionally import
// the native-only TrackPlayerModule and throw at require-time), so merely
// requiring the package here would blank the whole page before React mounts.
// contexts/AudioContext.web.tsx provides the web audio implementation instead.
const { Platform } = require('react-native');
if (Platform.OS !== 'web') {
  const TrackPlayer = require('react-native-track-player').default;
  TrackPlayer.registerPlaybackService(() => require('./service').default);
} else {
  // react-native-web's Alert is a no-op, which would leave every confirmation
  // dialog in the app dead on the web and Windows builds. Patch it before
  // expo-router mounts anything that might call it. See utils/webAlert.web.ts.
  require('./utils/webAlert').installWebAlert();
}

// Boot Expo Router
require('expo-router/entry');
