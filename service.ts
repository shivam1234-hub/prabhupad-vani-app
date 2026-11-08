import TrackPlayer, { Event, State } from 'react-native-track-player';

/**
 * Play that also recovers a player stuck in the error state. A streamed
 * lecture left paused can fail to buffer when the network drops (phone asleep,
 * Wi-Fi to mobile switch); after that, play() alone does nothing.
 */
export async function playOrRecover() {
  const { state } = await TrackPlayer.getPlaybackState();
  if (state === State.Error) {
    const position = (await TrackPlayer.getProgress()).position;
    await TrackPlayer.retry();
    if (position > 0) await TrackPlayer.seekTo(position);
  }
  await TrackPlayer.play();
}

async function togglePlayPause() {
  const { state } = await TrackPlayer.getPlaybackState();
  if (state === State.Playing || state === State.Buffering || state === State.Loading) {
    await TrackPlayer.pause();
  } else {
    await playOrRecover();
  }
}

// This runs in a separate background thread when the app is closed.
// It handles remote control events (lock screen, notification, headphones).
export default async function () {
  TrackPlayer.addEventListener(Event.RemotePlay, () => playOrRecover().catch(() => {}));
  TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
  // The single button on Bluetooth / wired earphones sends MEDIA_PLAY_PAUSE,
  // which the player reports as its own event, not as RemotePlay/RemotePause.
  TrackPlayer.addEventListener(Event.RemotePlayPause, () => togglePlayPause().catch(() => {}));
  TrackPlayer.addEventListener(Event.RemoteNext, () => TrackPlayer.skipToNext());
  TrackPlayer.addEventListener(Event.RemotePrevious, () => TrackPlayer.skipToPrevious());
  TrackPlayer.addEventListener(Event.RemoteStop, () => TrackPlayer.reset());
  TrackPlayer.addEventListener(Event.RemoteSeek, (e) => TrackPlayer.seekTo(e.position));
  TrackPlayer.addEventListener(Event.RemoteJumpForward, () => TrackPlayer.seekBy(15));
  TrackPlayer.addEventListener(Event.RemoteJumpBackward, () => TrackPlayer.seekBy(-15));
};
