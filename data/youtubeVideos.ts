// YouTube videos that burn Srila Prabhupada's spoken words onto the screen as
// slides. Sourced from the "Srila Prabhupada Lectures" (@allsrilaprabhupadalectures)
// and "The Acharya" (@TheAcharya1) channels, joined to our lectures by date, or
// by scripture type + verse + location where a title carries no date.
//
// data/youtubeMap.json is AUTO-GENERATED — regenerate after either channel
// uploads more with:
//   node scripts/map-youtube.js

import rawMap from './youtubeMap.json';

export interface YouTubeVideo {
  videoId: string;
  /** Original channel title, kept verbatim so the credit on screen is honest. */
  ytTitle: string;
  channel: string;
  durationSec?: number;
}

export interface YouTubeEntry extends YouTubeVideo {
  /** Other channels' videos of the same lecture, if any. */
  alternates?: YouTubeVideo[];
}

const MAP = rawMap as Record<string, YouTubeEntry>;

export function getYouTubeEntry(pvId: string | undefined): YouTubeEntry | null {
  if (!pvId) return null;
  return MAP[pvId] ?? null;
}

export function hasYouTubeVideo(pvId: string | undefined): boolean {
  return !!pvId && pvId in MAP;
}

/** Primary video first, then any alternates — the order we offer them in. */
export function getYouTubeVideos(pvId: string | undefined): YouTubeVideo[] {
  const e = getYouTubeEntry(pvId);
  if (!e) return [];
  const { alternates, ...primary } = e;
  return [primary, ...(alternates ?? [])];
}

/**
 * Embed URL for the official YouTube IFrame player.
 *
 * We deliberately use the standard embed rather than resolving media streams
 * ourselves: the embedded player is the only YouTube-sanctioned way to play
 * this content, and it keeps the burned-in slides exactly as the channel
 * rendered them.
 */
export function youtubeEmbedUrl(videoId: string, startSec = 0): string {
  const params = new URLSearchParams({
    playsinline: '1',
    rel: '0',
    modestbranding: '1',
    fs: '1',
  });
  if (startSec > 0) params.set('start', String(Math.floor(startSec)));
  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
}

/**
 * Origin the native WebView presents itself as when hosting the embed.
 *
 * Two separate rules are being satisfied here, and they pull in opposite
 * directions:
 *
 *  1. The embed refuses a request carrying no `Referer` at all — it answers
 *     with playabilityStatus "Video player configuration error". So the player
 *     can never be the WebView's top-level document; it has to sit in an
 *     iframe inside a page that has an origin of its own.
 *  2. That origin must be a genuine *third-party* site. Pointing it at
 *     youtube.com itself reads as a self-embed and is rejected just as firmly,
 *     with "This video is unavailable" — which looks like a dead video but is
 *     really a rejected origin.
 *
 * Hence a domain of our own. It is only ever an identity for the embed
 * handshake — nothing is fetched from it, so it does not need to resolve.
 */
export const YOUTUBE_EMBED_ORIGIN = 'https://prabhupadavani.app';

/**
 * A minimal page that hosts the embed in an iframe, for `WebView`'s
 * `{ html, baseUrl }` source.
 *
 * Loading `youtubeEmbedUrl()` straight into a WebView looks like it should
 * work, but a top-level navigation sends no `Referer`, and without one YouTube
 * fails the video with "Video player configuration error" instead of playing
 * it. Wrapping it in a document served from {@link YOUTUBE_EMBED_ORIGIN} gives
 * the iframe request a referrer and an embedding origin, which is all the
 * player was asking for.
 *
 * The iframe tells us when it is up via `postMessage`, since the outer
 * document's own load event fires long before the player is ready.
 */
export function youtubeEmbedHtml(videoId: string, startSec = 0): string {
  // `&` between query params has to be escaped to sit in an HTML attribute.
  const src = youtubeEmbedUrl(videoId, startSec).replace(/&/g, '&amp;');
  // Kept deliberately ASCII-only: Hermes stores any string constant holding a
  // non-ASCII character as UTF-16, which makes the whole chunk invisible to a
  // `strings` check of the built bundle.
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <!-- No page zoom. Zooming happens in React Native, on the view that hosts
         this page: letting the WebView zoom as well leaves the page pannable,
         which drifts the player off centre. -->
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
    <style>
      html, body { margin: 0; padding: 0; height: 100%; width: 100%; background: #000; overflow: hidden; }
      /* Centre the player in whatever box it is given. */
      body { display: flex; align-items: center; justify-content: center; }
      iframe { display: block; border: 0; width: 100%; height: 100%; }
    </style>
  </head>
  <body>
    <iframe
      src="${src}"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
      allowfullscreen
    ></iframe>
    <script>
      var f = document.querySelector('iframe');
      function tell(msg) {
        if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(msg);
      }
      f.addEventListener('load', function () { tell('ready'); });
      f.addEventListener('error', function () { tell('error'); });

      // The expand button lives inside a cross-origin iframe, so we cannot see
      // the tap. The resulting fullscreen transition still raises
      // fullscreenchange on THIS document, which is enough to rotate to match.
      function onFsChange() {
        var el = document.fullscreenElement || document.webkitFullscreenElement;
        tell(el ? 'fullscreen:on' : 'fullscreen:off');
      }
      document.addEventListener('fullscreenchange', onFsChange);
      document.addEventListener('webkitfullscreenchange', onFsChange);
    </script>
  </body>
</html>`;
}

export function youtubeWatchUrl(videoId: string, startSec = 0): string {
  const t = startSec > 0 ? `&t=${Math.floor(startSec)}` : '';
  return `https://www.youtube.com/watch?v=${videoId}${t}`;
}

export function formatDuration(sec?: number): string | null {
  if (!sec) return null;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m} min`;
}

export const YOUTUBE_VIDEO_COUNT = Object.keys(MAP).length;
