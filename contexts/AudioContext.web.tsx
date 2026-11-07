import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { Recording } from '../data/types';
import { audioEvents } from '../utils/audioEvents';
import { getNotificationArt } from '../components/TypeThumb';
import { useAutoPlayNext } from '../hooks/useAutoPlayNext';

// Web preview only. react-native-track-player's web shim is broken in the
// installed alpha version — its Capability/State enum modules import the
// *native* TrackPlayerModule unconditionally (no .web variant), so merely
// importing the library throws at module-eval time and blanks the whole
// page before React ever mounts. This file gives web the same
// AudioState/AudioActions shape using a plain <audio> element instead, so
// every consumer (TranscriptViewer, MiniPlayer, AudioPlayer) works
// unmodified. Metro picks this file automatically on web via the .web.tsx
// platform extension; native builds still use AudioContext.tsx +
// track-player for lock-screen/background controls.

// Media Session wants URLs; on web a required image is a URL string (or {uri}).
function artworkFor(type: string): MediaImage[] {
  const src: any = getNotificationArt(type) ?? require('../assets/icon.png');
  const uri = typeof src === 'string' ? src : src?.uri ?? src?.default;
  return uri ? [{ src: uri, sizes: '600x600', type: 'image/jpeg' }] : [];
}

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

// Split into two contexts so screens that don't need the ticking position
// don't re-render on every timeupdate. See AudioContext.tsx for the full
// rationale — this file mirrors the same split for web/desktop.
type AudioMeta = Omit<AudioState, 'positionMs' | 'durationMs'> & AudioActions;
interface AudioPosition { positionMs: number; durationMs: number }

const AudioContext = createContext<AudioMeta | null>(null);
const AudioPositionContext = createContext<AudioPosition>({ positionMs: 0, durationMs: 0 });

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  if (!audioElRef.current) {
    audioElRef.current = new Audio();
  }

  const [recording, setRecording] = useState<Recording | null>(null);
  const [audioUrls, setAudioUrls] = useState<string[]>([]);
  const [partIndex, setPartIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [speed, setSpeedState] = useState(1.0);
  const [error, setError] = useState<string | null>(null);

  const audioUrlsRef = useRef(audioUrls);
  audioUrlsRef.current = audioUrls;
  const partIndexRef = useRef(partIndex);
  partIndexRef.current = partIndex;
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const recordingRef = useRef<Recording | null>(null);
  // Set below, once play() exists; the 'ended' listener is registered first.
  const advanceRef = useRef<(finished: Recording) => void>(() => {});

  useEffect(() => {
    const el = audioElRef.current!;
    const onTime = () => setPositionMs(Math.round(el.currentTime * 1000));
    const onDuration = () => setDurationMs(Number.isFinite(el.duration) ? Math.round(el.duration * 1000) : 0);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onWaiting = () => setIsLoading(true);
    const onCanPlay = () => setIsLoading(false);
    const onEnded = () => {
      const urls = audioUrlsRef.current;
      const next = partIndexRef.current + 1;
      if (next < urls.length) {
        setPartIndex(next);
        el.src = urls[next];
        el.play().catch(() => {});
      } else {
        setIsPlaying(false);
        const finished = recordingRef.current;
        if (finished) advanceRef.current(finished);
      }
    };
    const onError = () => setError('Could not load audio');

    el.addEventListener('timeupdate', onTime);
    el.addEventListener('durationchange', onDuration);
    el.addEventListener('loadedmetadata', onDuration);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('waiting', onWaiting);
    el.addEventListener('canplay', onCanPlay);
    el.addEventListener('ended', onEnded);
    el.addEventListener('error', onError);
    return () => {
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('durationchange', onDuration);
      el.removeEventListener('loadedmetadata', onDuration);
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('waiting', onWaiting);
      el.removeEventListener('canplay', onCanPlay);
      el.removeEventListener('ended', onEnded);
      el.removeEventListener('error', onError);
    };
  }, []);

  const play = useCallback(async (
    rec: Recording,
    urls: string[],
    startIndex = 0,
    localUris?: string[],
  ) => {
    const el = audioElRef.current!;
    const effectiveUrls = (localUris && localUris.length > 0) ? localUris : urls;
    recordingRef.current = rec;
    setRecording(rec);
    setAudioUrls(effectiveUrls);
    setPartIndex(startIndex);
    setError(null);
    setPositionMs(0);
    try {
      el.src = effectiveUrls[startIndex];
      el.playbackRate = speedRef.current;
      await el.play();
      audioEvents.emitPlay({ id: rec.pvId ?? rec.id, title: rec.title, type: rec.type, positionMs: 0, durationMs: 0 });
    } catch {
      setError('Could not load audio');
    }
  }, []);

  advanceRef.current = useAutoPlayNext(play, () => recordingRef.current);

  const pause = useCallback(async () => { audioElRef.current!.pause(); }, []);
  const resume = useCallback(async () => { await audioElRef.current!.play().catch(() => {}); }, []);
  const seek = useCallback(async (ms: number) => {
    audioElRef.current!.currentTime = ms / 1000;
  }, []);
  const stop = useCallback(async () => {
    const el = audioElRef.current!;
    recordingRef.current = null;
    el.pause();
    el.removeAttribute('src');
    el.load();
    setRecording(null);
    setAudioUrls([]);
    setPartIndex(0);
    setError(null);
    setPositionMs(0);
    setDurationMs(0);
  }, []);
  const setSpeed = useCallback(async (s: number) => {
    setSpeedState(s);
    audioElRef.current!.playbackRate = s;
  }, []);
  const skipForward = useCallback(async () => {
    const el = audioElRef.current!;
    el.currentTime = Math.min(el.duration || Infinity, el.currentTime + 15);
  }, []);
  const skipBackward = useCallback(async () => {
    const el = audioElRef.current!;
    el.currentTime = Math.max(0, el.currentTime - 15);
  }, []);
  const playPart = useCallback(async (index: number) => {
    const el = audioElRef.current!;
    const urls = audioUrlsRef.current;
    if (!urls[index]) return;
    setPartIndex(index);
    setPositionMs(0);
    el.src = urls[index];
    await el.play().catch(() => {});
  }, []);

  // ------------------------------------------------------------------------
  // Desktop integration
  //
  // The native build gets lock-screen and notification controls from
  // react-native-track-player. The equivalent on Windows is the Media Session
  // API, which Chromium hands to the system media overlay — so the title, the
  // hardware media keys and the scrub bar in the volume flyout all work
  // against the same <audio> element, without the shared UI knowing.

  const actionsRef = useRef({ pause, resume, seek, stop, setSpeed, skipForward, skipBackward, playPart });
  actionsRef.current = { pause, resume, seek, stop, setSpeed, skipForward, skipBackward, playPart };

  const stateRef = useRef({ isPlaying, positionMs, durationMs, speed, partIndex, urls: audioUrls });
  stateRef.current = { isPlaying, positionMs, durationMs, speed, partIndex, urls: audioUrls };

  useEffect(() => {
    const ms = typeof navigator !== 'undefined' ? navigator.mediaSession : undefined;
    if (!ms) return;

    const set = (action: MediaSessionAction, handler: ((details?: any) => void) | null) => {
      // Chromium rejects actions it doesn't know; an unsupported one must not
      // take the rest of the handlers down with it.
      try { ms.setActionHandler(action, handler as any); } catch {}
    };

    set('play', () => { actionsRef.current.resume(); });
    set('pause', () => { actionsRef.current.pause(); });
    set('stop', () => { actionsRef.current.stop(); });
    set('seekbackward', () => { actionsRef.current.skipBackward(); });
    set('seekforward', () => { actionsRef.current.skipForward(); });
    set('seekto', (details: any) => {
      if (typeof details?.seekTime === 'number') actionsRef.current.seek(details.seekTime * 1000);
    });
    // Multi-part lectures are the closest thing this app has to a track list,
    // so the next/previous keys step between parts.
    set('previoustrack', () => {
      const { partIndex: i } = stateRef.current;
      if (i > 0) actionsRef.current.playPart(i - 1);
      else actionsRef.current.seek(0);
    });
    set('nexttrack', () => {
      const { partIndex: i, urls } = stateRef.current;
      if (i + 1 < urls.length) actionsRef.current.playPart(i + 1);
    });

    return () => {
      for (const action of [
        'play', 'pause', 'stop', 'seekbackward', 'seekforward', 'seekto',
        'previoustrack', 'nexttrack',
      ] as MediaSessionAction[]) set(action, null);
    };
  }, []);

  // Title shown in the Windows media overlay.
  useEffect(() => {
    const ms = typeof navigator !== 'undefined' ? navigator.mediaSession : undefined;
    if (!ms) return;
    if (!recording) {
      ms.metadata = null;
      ms.playbackState = 'none';
      return;
    }
    const parts = audioUrls.length;
    try {
      ms.metadata = new MediaMetadata({
        title: recording.title,
        artist: 'His Divine Grace A.C. Bhaktivedanta Swami Prabhupada',
        album: parts > 1 ? `Part ${partIndex + 1} of ${parts}` : 'Prabhupada Vani',
        artwork: artworkFor(recording.type),
      });
    } catch {}
  }, [recording, partIndex, audioUrls.length]);

  useEffect(() => {
    const ms = typeof navigator !== 'undefined' ? navigator.mediaSession : undefined;
    if (!ms) return;
    ms.playbackState = recording ? (isPlaying ? 'playing' : 'paused') : 'none';
  }, [isPlaying, recording]);

  // Feeds the scrub bar in the system overlay. `durationMs` is 0 until the
  // browser has metadata, and setPositionState throws on a duration of 0.
  useEffect(() => {
    const ms = typeof navigator !== 'undefined' ? navigator.mediaSession : undefined;
    if (!ms?.setPositionState || durationMs <= 0) return;
    try {
      ms.setPositionState({
        duration: durationMs / 1000,
        playbackRate: speed,
        position: Math.min(positionMs, durationMs) / 1000,
      });
    } catch {}
  }, [durationMs, speed, Math.floor(positionMs / 1000)]);

  const runCommand = useCallback((command: string) => {
    const a = actionsRef.current;
    const { isPlaying: playing, speed: current } = stateRef.current;
    switch (command) {
      case 'playPause': playing ? a.pause() : a.resume(); break;
      case 'back15': a.skipBackward(); break;
      case 'forward15': a.skipForward(); break;
      case 'speedUp': a.setSpeed(stepSpeed(current, 1)); break;
      case 'speedDown': a.setSpeed(stepSpeed(current, -1)); break;
      case 'speedReset': a.setSpeed(1.0); break;
      case 'stop': a.stop(); break;
    }
  }, []);

  // Playback commands from the Electron menu (desktop/main.js).
  useEffect(() => {
    const onCommand = (window as any).desktop?.onCommand;
    if (typeof onCommand !== 'function') return;
    return onCommand(runCommand);
  }, [runCommand]);

  // The bare-key versions of those shortcuts. These are bound here rather than
  // as menu accelerators because an Electron accelerator fires before the page
  // sees the key — Space would stop being typeable in the search box, and the
  // arrow keys would stop moving the caret. Here we can simply decline when a
  // text field has focus.
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const isTyping = () => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return false;
      if (el.isContentEditable) return true;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTyping()) return;
      // Nothing playing means nothing to control; let the keys scroll the page.
      if (!stateRef.current.urls.length) return;

      let command: string | null = null;
      if (event.code === 'Space') command = 'playPause';
      else if (event.key === 'ArrowLeft') command = event.shiftKey ? 'speedDown' : 'back15';
      else if (event.key === 'ArrowRight') command = event.shiftKey ? 'speedUp' : 'forward15';

      if (!command) return;
      event.preventDefault();
      runCommand(command);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [runCommand]);

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

/** See AudioContext.tsx for the full docs; kept identical here. */
export function useAudio(): AudioState & AudioActions {
  const meta = useContext(AudioContext);
  if (!meta) throw new Error('useAudio must be used within AudioProvider');
  const pos = useContext(AudioPositionContext);
  return { ...meta, positionMs: pos.positionMs, durationMs: pos.durationMs };
}

export function useAudioPosition(): AudioPosition {
  return useContext(AudioPositionContext);
}

export function useAudioMeta(): AudioMeta {
  const meta = useContext(AudioContext);
  if (!meta) throw new Error('useAudioMeta must be used within AudioProvider');
  return meta;
}

/** Same ladder the on-screen speed button cycles through (components/AudioPlayer.tsx). */
const SPEEDS = [0.75, 1.0, 1.25, 1.5, 2.0];

function stepSpeed(current: number, direction: 1 | -1): number {
  const idx = SPEEDS.indexOf(current);
  // An off-ladder speed (restored from settings, say) snaps to the nearest step.
  const from = idx >= 0
    ? idx
    : SPEEDS.reduce((best, s, i) =>
      Math.abs(s - current) < Math.abs(SPEEDS[best] - current) ? i : best, 0);
  return SPEEDS[Math.min(SPEEDS.length - 1, Math.max(0, from + direction))];
}
