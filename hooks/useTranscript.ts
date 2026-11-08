import { useCallback, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { readLocalTranscript, writeLocalTranscript } from '../utils/localTranscript';
import { parseWikitext, TranscriptData, TranscriptPart } from '../utils/wikitextParser';

export type { TranscriptData, TranscriptPart };

// In-memory cache: survives re-renders and navigation within a session
const memCache = new Map<string, TranscriptData>();

const CACHE_KEY = 'transcript_wikitext_v1';
// Persisted: { [vanisourceUrl]: string (wikitext) } capped at 150 entries

async function readWikitextCache(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function writeWikitextCache(url: string, wikitext: string) {
  try {
    const cache = await readWikitextCache();
    cache[url] = wikitext;
    // Trim to most recent 150 entries
    const keys = Object.keys(cache);
    if (keys.length > 150) {
      const trimmed: Record<string, string> = {};
      keys.slice(-150).forEach(k => { trimmed[k] = cache[k]; });
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(trimmed));
    } else {
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    }
  } catch {}
}

export function useTranscript() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<TranscriptData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchTranscript = useCallback(async (vanisourceUrl: string, recordingId?: string) => {
    // 1. In-memory cache hit — instant, no state churn (no spinner flash).
    if (memCache.has(vanisourceUrl)) {
      setData(memCache.get(vanisourceUrl)!);
      setLoading(false);
      setError(null);
      return;
    }

    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;
    setError(null);
    setData(null);

    // Only show the spinner if the fetch actually stalls. Local disk and
    // AsyncStorage reads are typically <50 ms — flashing a spinner for that
    // long makes downloaded lectures look like they're loading when the file
    // is already right there.
    const spinnerTimer = setTimeout(() => {
      if (!signal.aborted) setLoading(true);
    }, 250);

    try {
      // 2. Downloaded transcript on disk. Where "disk" is lives behind
      //    readLocalTranscript, which is the app sandbox on native and Electron's
      //    userData folder on Windows.
      if (recordingId) {
        const wikitext = await readLocalTranscript(recordingId);
        if (signal.aborted) return;
        if (wikitext) {
          const result = parseWikitext(wikitext);
          memCache.set(vanisourceUrl, result);
          setData(result);
          return;
        }
      }

      // 3. AsyncStorage wikitext cache (persists across sessions)
      try {
        const cache = await readWikitextCache();
        if (signal.aborted) return;
        if (cache[vanisourceUrl]) {
          const result = parseWikitext(cache[vanisourceUrl]);
          memCache.set(vanisourceUrl, result);
          setData(result);
          // Back-fill the local transcript file for downloaded lectures whose
          // download predated the transcript-alongside-audio feature, so next
          // time this lecture opens offline it hits step 2 instead of falling
          // through to the network again.
          if (recordingId) {
            writeLocalTranscript(recordingId, cache[vanisourceUrl]).catch(() => {});
          }
          return;
        }
      } catch {}

      // 4. Network fetch
      const pageTitle = vanisourceUrl.split('/wiki/')[1];
      if (!pageTitle) throw new Error('Invalid vanisource URL');

      // vanisource.org's edge already sends a single Access-Control-Allow-Origin: *
      // unconditionally. Passing MediaWiki's own origin=* param makes MediaWiki add
      // a SECOND copy of that header — Chrome rejects the duplicate as an invalid
      // CORS response ("No Access-Control-Allow-Origin header"), so web must omit it.
      const { Platform } = require('react-native');
      const apiUrl =
        `https://vanisource.org/w/api.php?action=parse&page=${pageTitle}` +
        `&prop=wikitext&format=json` +
        (Platform.OS !== 'web' ? '&origin=*' : '');
      // React Native's Android HTTP client has no timeouts at all. After the
      // phone has been idle, a request can sit on a dead connection forever,
      // which left the screen on "Loading transcript…" with no audio controls.
      // Give up after 20 s and show the Retry button instead.
      const controller = abortRef.current!;
      let timedOut = false;
      const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 20000);
      let json: any;
      try {
        const res = await fetch(apiUrl, { signal });
        if (!res.ok) throw new Error(`Network error ${res.status}`);
        json = await res.json();
      } catch (e: any) {
        if (timedOut) throw new Error('The connection timed out. Check the internet and retry.');
        throw e;
      } finally {
        clearTimeout(timeout);
      }

      const wikitext: string = json?.parse?.wikitext?.['*'];
      if (!wikitext) throw new Error('No transcript content returned');

      const result = parseWikitext(wikitext);
      memCache.set(vanisourceUrl, result);
      setData(result);

      // Persist wikitext to AsyncStorage for next session, and (if this was a
      // downloaded lecture without a local transcript) alongside the audio.
      writeWikitextCache(vanisourceUrl, wikitext);
      if (recordingId) writeLocalTranscript(recordingId, wikitext).catch(() => {});
    } catch (e: any) {
      if (e.name !== 'AbortError') setError(e.message ?? 'Failed to load');
    } finally {
      clearTimeout(spinnerTimer);
      // Superseded by a newer fetch: that one owns the spinner. A timeout
      // also aborts, but this fetch is still the current one.
      if (abortRef.current?.signal === signal) setLoading(false);
    }
  }, []);

  return { loading, data, error, fetchTranscript };
}
