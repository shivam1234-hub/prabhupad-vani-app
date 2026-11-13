import TrackPlayer, { Event, State } from 'react-native-track-player';
import { getTalk, isTalkOnly, loadTalkOnly, skipFor } from './utils/talkOnly';

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

/**
 * "Prabhupāda only": called on every progress tick (1 s) and track change.
 * Runs here, in the playback service, so it works with the screen off.
 */
let skipping = false;
async function applyTalkOnly() {
  if (skipping || !isTalkOnly()) return;
  skipping = true;
  try {
    const { state } = await TrackPlayer.getPlaybackState();
    if (state !== State.Playing && state !== State.Buffering) return;
    const track = await TrackPlayer.getActiveTrack();
    const data = getTalk(track?.id as string | undefined);
    if (!data) return;
    const index = (await TrackPlayer.getActiveTrackIndex()) ?? 0;
    const queue = await TrackPlayer.getQueue();
    const { position, duration } = await TrackPlayer.getProgress();
    const action = skipFor(data, index, position, index < queue.length - 1);
    if (action.kind === 'seek') await TrackPlayer.seekTo(action.to);
    else if (action.kind === 'nextPart') await TrackPlayer.skipToNext();
    // Past the last kept range: run to the end so autoplay-next still fires.
    else if (action.kind === 'end' && duration > 0 && position < duration - 1) {
      await TrackPlayer.seekTo(Math.max(duration - 0.5, 0));
    }
  } catch {
    // Player busy (queue being swapped); the next tick tries again.
  } finally {
    skipping = false;
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
  loadTalkOnly();
  TrackPlayer.addEventListener(Event.PlaybackProgressUpdated, () => { applyTalkOnly(); });
  TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, () => { applyTalkOnly(); });
  TrackPlayer.addEventListener(Event.PlaybackState, () => { applyTalkOnly(); });
};
