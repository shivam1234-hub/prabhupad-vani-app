import { useCallback, useRef } from 'react';
import { Recording, getRecordingId } from '../data/types';
import { useDownload } from '../contexts/DownloadContext';
import { useSettings } from '../contexts/SettingsContext';
import { fetchAudioUrls } from '../utils/audioUrls';
import { upcomingInSection } from '../utils/nextInSection';
import { audioEvents } from '../utils/audioEvents';

type Play = (rec: Recording, urls: string[], partIndex?: number, localUris?: string[]) => Promise<void>;

/**
 * Returns `advance(finished)`, which the audio provider calls when the last
 * part of `finished` has played out. If autoplay is on it starts the next
 * lecture in the same section — from disk when it's downloaded, otherwise
 * from the vanisource mp3 URLs. A neighbour with no audio is skipped.
 *
 * `getCurrent` is read again after the network fetch: if the listener has
 * started or stopped something in the meantime, the advance is dropped
 * rather than yanking playback away from their choice.
 */
export function useAutoPlayNext(play: Play, getCurrent: () => Recording | null) {
  const { autoPlayNext } = useSettings();
  const { getLocalUris } = useDownload();

  // The providers register their end-of-queue listeners once, so read the
  // latest values through refs instead of re-subscribing.
  const latest = useRef({ autoPlayNext, getLocalUris, play, getCurrent });
  latest.current = { autoPlayNext, getLocalUris, play, getCurrent };

  return useCallback(async (finished: Recording) => {
    if (!latest.current.autoPlayNext) return;
    for (const next of upcomingInSection(finished)) {
      const localUris = latest.current.getLocalUris(getRecordingId(next));
      let urls = localUris;
      if (!urls.length) {
        try { urls = await fetchAudioUrls(next.vanisourceUrl); } catch { urls = []; }
      }
      if (latest.current.getCurrent() !== finished) return;
      if (!urls.length) continue;
      await latest.current.play(next, urls, 0, localUris.length ? localUris : undefined);
      // Lets an open lecture screen for `finished` follow along to `next`.
      audioEvents.emitAutoAdvance({ fromId: getRecordingId(finished), toId: getRecordingId(next) });
      return;
    }
  }, []);
}
