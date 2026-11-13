import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import TrackPlayer, {
  State, Capability, Event, usePlaybackState, useProgress, useActiveTrack, useTrackPlayerEvents,
} from 'react-native-track-player';
import { Lecture, Recording } from '../data/types';
import { audioEvents } from '../utils/audioEvents';
import { getNotificationArt } from '../components/TypeThumb';
import { useAutoPlayNext } from '../hooks/useAutoPlayNext';
import { playOrRecover } from '../service';

export interface AudioState {
  recording: Recording | null;
  lecture: Recording | null;
  isPlaying: boolean;
  isLoading: boolean;
  positionMs: number;
  durationMs: number;
  speed: number;
  error: string | null;
  audioUrls: string[];
  partIndex: number;
}

export interface AudioActions {
  play: (recording: Recording, audioUrls: string[], partIndex?: number, localUris?: string[]) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  seek: (ms: number) => Promise<void>;
  stop: () => Promise<void>;
  setSpeed: (speed: number) => Promise<void>;
  skipForward: () => Promise<void>;
  skipBackward: () => Promise<void>;
  playPart: (index: number) => Promise<void>;
}

// The audio context is split into two so screens can subscribe to either
// depending on what they need. Every consumer of a React context re-renders
// each time the context's value reference changes, so bundling the 2 Hz
// position tick with things like `recording` and the action callbacks made
// the entire lecture screen (hero, sticky bar, transcript, etc.) re-render
// twice a second — that's what made scrolling and typing in the search box
// feel janky while audio was playing.
//
// - AudioContext: the rarely-changing state and the action callbacks.
//   Screens like LectureDetail read this and don't tick on playback.
// - AudioPositionContext: `positionMs` + `durationMs`, updated on the ticker.
//   Only the pinned time display and the (opt-in) audio-follow highlight
//   subscribe, so tick re-renders are contained to those tiny leaves.
type AudioMeta = Omit<AudioState, 'positionMs' | 'durationMs'> & AudioActions;
interface AudioPosition { positionMs: number; durationMs: number }

const AudioContext = createContext<AudioMeta | null>(null);
const AudioPositionContext = createContext<AudioPosition>({ positionMs: 0, durationMs: 0 });

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const playbackState = usePlaybackState();
  // 500 ms is the sweet spot: fine enough that the time-display counter and
  // the scrub bar feel live, coarse enough not to steal frames from a scroll
  // gesture. The old 200 ms rate gave us 5 tick-driven re-renders per
  // second even when nothing on screen depended on the extra resolution.
  const { position, duration } = useProgress(500);
  const activeTrack = useActiveTrack();

  const [recording, setRecording] = useState<Recording | null>(null);
  const [audioUrls, setAudioUrls] = useState<string[]>([]);
  const [partIndex, setPartIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [speed, setSpeedState] = useState(1.0);

  const speedRef = useRef(1.0);
  const setupDone = useRef(false);
  const recordingRef = useRef<Recording | null>(null);
  // True while play() is swapping the queue, so the reset() inside it can't
  // be mistaken for the old lecture reaching its end.
  const loadingQueueRef = useRef(false);

  useEffect(() => {
    if (setupDone.current) return;
    setupDone.current = true;
    TrackPlayer.setupPlayer().then(() =>
      TrackPlayer.updateOptions({
        capabilities: [
          Capability.Play,
          Capability.Pause,
          Capability.Stop,
          Capability.SeekTo,
          Capability.JumpForward,
          Capability.JumpBackward,
        ],
        notificationCapabilities: [
          Capability.Play,
          Capability.Pause,
          Capability.JumpBackward,
          Capability.JumpForward,
        ],
        forwardJumpInterval: 15,
        backwardJumpInterval: 15,
        // Drives "Prabhupāda only" skipping in service.ts, also with the screen off.
        progressUpdateEventInterval: 1,
      })
    ).catch(() => {});
  }, []);

  useEffect(() => {
    TrackPlayer.getActiveTrackIndex()
      .then(idx => { if (idx != null) setPartIndex(idx); })
      .catch(() => {});
  }, [activeTrack]);

  const { state } = playbackState;
  const isPlaying = state === State.Playing;
  const isLoading = state === State.Loading || state === State.Buffering;
  const positionMs = Math.round(position * 1000);
  const durationMs = Math.round(duration * 1000);

  const play = useCallback(async (
    rec: Recording,
    urls: string[],
    startIndex = 0,
    localUris?: string[],
  ) => {
    const effectiveUrls = (localUris && localUris.length > 0) ? localUris : urls;
    recordingRef.current = rec;
    setRecording(rec);
    setAudioUrls(effectiveUrls);
    setPartIndex(startIndex);
    setError(null);
    loadingQueueRef.current = true;
    try {
      await TrackPlayer.reset();
      await TrackPlayer.add(
        effectiveUrls.map((url, i) => ({
          id: rec.pvId ?? rec.id,
          url,
          title: effectiveUrls.length > 1 ? `${rec.title} — Part ${i + 1}` : rec.title,
          artist: 'Srila Prabhupada',
          album: rec.fullTitle,
          // Book cover (BG / SB / CC) as the notification + lock-screen
          // background; app icon for every other collection.
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          artwork: (getNotificationArt(rec.type) ?? require('../assets/icon.png')) as any,
        }))
      );
      if (startIndex > 0) await TrackPlayer.skip(startIndex);
      if (speedRef.current !== 1.0) await TrackPlayer.setRate(speedRef.current);
      await TrackPlayer.play();
      // Use pvId ?? id so history entries match what PositionTracker looks up
      audioEvents.emitPlay({ id: rec.pvId ?? rec.id, title: rec.title, type: rec.type, positionMs: 0, durationMs: 0 });
    } catch {
      setError('Could not load audio');
    } finally {
      loadingQueueRef.current = false;
    }
  }, []);

  const pause = useCallback(() => TrackPlayer.pause().catch(() => {}), []);
  // Recovers a player that errored while paused (see playOrRecover).
  const resume = useCallback(() => playOrRecover().catch(() => {}), []);
  const seek = useCallback(async (ms: number) => {
    await TrackPlayer.seekTo(ms / 1000).catch(() => {});
  }, []);
  const stop = useCallback(async () => {
    recordingRef.current = null;
    await TrackPlayer.reset().catch(() => {});
    setRecording(null);
    setAudioUrls([]);
    setPartIndex(0);
    setError(null);
  }, []);
  const setSpeed = useCallback(async (s: number) => {
    speedRef.current = s;
    setSpeedState(s);
    await TrackPlayer.setRate(s).catch(() => {});
  }, []);
  const skipForward = useCallback(() => TrackPlayer.seekBy(15).catch(() => {}), []);
  const skipBackward = useCallback(() => TrackPlayer.seekBy(-15).catch(() => {}), []);
  const playPart = useCallback(async (index: number) => {
    setPartIndex(index);
    await TrackPlayer.skip(index).catch(() => {});
    await TrackPlayer.play().catch(() => {});
  }, []);

  // The queue holds every part of one lecture, so the queue running dry means
  // the whole lecture has finished — time to move on to the next one.
  const advance = useAutoPlayNext(play, () => recordingRef.current);
  useTrackPlayerEvents([Event.PlaybackQueueEnded], () => {
    const finished = recordingRef.current;
    if (finished && !loadingQueueRef.current) advance(finished);
  });

  const metaValue = useMemo<AudioMeta>(() => ({
    recording,
    lecture: recording,
    isPlaying,
    isLoading,
    speed,
    error,
    audioUrls,
    partIndex,
    play, pause, resume, seek, stop, setSpeed, skipForward, skipBackward, playPart,
  }), [
    recording, isPlaying, isLoading, speed, error, audioUrls, partIndex,
    play, pause, resume, seek, stop, setSpeed, skipForward, skipBackward, playPart,
  ]);

  const positionValue = useMemo<AudioPosition>(() => ({ positionMs, durationMs }), [positionMs, durationMs]);

  return (
    <AudioContext.Provider value={metaValue}>
      <AudioPositionContext.Provider value={positionValue}>
        {children}
      </AudioPositionContext.Provider>
    </AudioContext.Provider>
  );
}

/**
 * Rarely-changing audio state + all the action callbacks. Reading this does
 * NOT cause the consumer to re-render on the 2 Hz position tick — use it
 * everywhere except where the current playback position is genuinely needed
 * on screen.
 */
export function useAudio(): AudioState & AudioActions {
  const meta = useContext(AudioContext);
  if (!meta) throw new Error('useAudio must be used within AudioProvider');
  // Fold position back in as read-only fields so existing callers that
  // destructure `audio.positionMs` / `audio.durationMs` keep working — but
  // note this reintroduces the tick re-render for that specific caller. If
  // you're only reading position, prefer `useAudioPosition()` directly.
  const pos = useContext(AudioPositionContext);
  return { ...meta, positionMs: pos.positionMs, durationMs: pos.durationMs };
}

/**
 * Just the ticking playback position. Prefer this over `useAudio()` when you
 * only need positionMs / durationMs — a consumer that reads only this hook
 * re-renders on the tick without dragging the rest of its ancestors along.
 */
export function useAudioPosition(): AudioPosition {
  return useContext(AudioPositionContext);
}

/**
 * Everything except position — action callbacks + isPlaying / recording etc.
 * Reading only this hook means the consumer does not re-render on the 2 Hz
 * playback tick. Use this in wide component trees like LectureDetail.
 */
export function useAudioMeta(): AudioMeta {
  const meta = useContext(AudioContext);
  if (!meta) throw new Error('useAudioMeta must be used within AudioProvider');
  return meta;
}

export type { Lecture };
