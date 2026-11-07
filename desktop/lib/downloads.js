'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { EventEmitter } = require('node:events');

const { getStream, getText } = require('./http');

const MAX_CONCURRENT = 3;
const NO_AUDIO = 'NO_AUDIO'; // sentinel — not a network error, skip silently in batch

/**
 * Desktop port of contexts/DownloadContext.tsx.
 *
 * The mobile build keeps the whole download engine in the renderer because
 * expo-file-system gives React Native direct disk access. A browser has no
 * such thing, so on Windows the engine lives here in the main process and the
 * renderer (contexts/DownloadContext.web.tsx) is a thin mirror of this state
 * over IPC. The semantics are deliberately identical to the mobile file:
 * per-part parallel fetch, 3 attempts with back-off, a 3-at-a-time batch
 * queue, cancellation, and a registry reconciled against what is actually on
 * disk at startup so downloads survive a reinstall.
 */
class DownloadManager extends EventEmitter {
  /**
   * @param {object} opts
   * @param {string} opts.audioDir  Directory that holds <id>/part-N.mp3
   * @param {string} opts.registryPath  JSON file mirroring AsyncStorage's dl_registry_v1
   */
  constructor({ audioDir, registryPath }) {
    super();
    this.audioDir = audioDir;
    this.registryPath = registryPath;

    /** @type {Record<string, {localUris: string[], totalBytes: number, downloadedAt: string}>} */
    this.registry = {};
    /** @type {Record<string, object>} */
    this.progress = {};

    /** Relative paths ("<id>/part-0.mp3") keyed by id — turned into URLs on the way out. */
    this.relUris = {};

    this.cancelled = new Set();
    this.controllers = new Map(); // id -> AbortController[]
    this.queue = [];
    this.activeCount = 0;
    this.processing = false;

    /** Set by main.js once the local server has a port. */
    this.audioBaseUrl = '';
  }

  // ---------------------------------------------------------------- helpers

  partPath(id, index) {
    return path.join(this.audioDir, id, `part-${index}.mp3`);
  }

  /**
   * The renderer plays these straight through an <audio> element, so they have
   * to be URLs rather than Windows paths. The local static server exposes the
   * audio directory under /__audio/, which keeps file:// (and its origin
   * restrictions) out of the picture entirely.
   */
  toUrl(rel) {
    return `${this.audioBaseUrl}/__audio/${rel.split(path.sep).map(encodeURIComponent).join('/')}`;
  }

  /** Registry as the renderer sees it: local file paths rebuilt as playable URLs. */
  publicRegistry() {
    const out = {};
    for (const [id, entry] of Object.entries(this.registry)) {
      out[id] = { ...entry, localUris: (this.relUris[id] ?? []).map((rel) => this.toUrl(rel)) };
    }
    return out;
  }

  emitRegistry() {
    this.emit('registry', this.publicRegistry());
  }

  emitProgress() {
    this.emit('progress', this.progress);
  }

  setProgress(id, next) {
    this.progress = { ...this.progress, [id]: next };
    this.emitProgress();
  }

  clearProgress(id) {
    const next = { ...this.progress };
    delete next[id];
    this.progress = next;
    this.emitProgress();
  }

  async persist() {
    const onDisk = {};
    for (const [id, entry] of Object.entries(this.registry)) {
      onDisk[id] = { ...entry, localUris: this.relUris[id] ?? [] };
    }
    await fsp.writeFile(this.registryPath, JSON.stringify(onDisk), 'utf8').catch(() => {});
  }

  // ------------------------------------------------------------------ boot

  /**
   * Load the saved registry, then reconcile it against the filesystem so that
   * downloads re-appear after a reinstall that cleared app data but left the
   * audio behind, and stale entries whose files were deleted disappear.
   */
  async load() {
    let saved = {};
    try {
      saved = JSON.parse(await fsp.readFile(this.registryPath, 'utf8')) ?? {};
    } catch {
      saved = {};
    }

    await fsp.mkdir(this.audioDir, { recursive: true }).catch(() => {});

    const merged = {};
    const mergedRel = {};
    let entries = [];
    try {
      entries = await fsp.readdir(this.audioDir, { withFileTypes: true });
    } catch {
      entries = [];
    }

    for (const dirent of entries) {
      if (!dirent.isDirectory()) continue;
      const id = dirent.name;
      try {
        const files = (await fsp.readdir(path.join(this.audioDir, id)))
          .filter((f) => f.endsWith('.mp3'))
          .sort(partSort);
        if (files.length === 0) continue;

        const rel = files.map((f) => path.join(id, f));
        let totalBytes = 0;
        for (const r of rel) {
          try {
            totalBytes += (await fsp.stat(path.join(this.audioDir, r))).size;
          } catch {}
        }

        mergedRel[id] = rel;
        merged[id] = saved[id]
          ? { ...saved[id], localUris: rel, totalBytes }
          : { localUris: rel, totalBytes, downloadedAt: new Date().toISOString() };
      } catch {}
    }

    this.registry = merged;
    this.relUris = mergedRel;
    await this.persist();
    this.emitRegistry();
  }

  // -------------------------------------------------------------- fetching

  /**
   * Pull the audio URLs out of a Vanisource page's wikitext.
   *
   * Runs here rather than in the renderer because Node has no same-origin
   * policy to appease — the mobile build has to append `&origin=*` to get
   * MediaWiki to send CORS headers, and that whole problem disappears once the
   * request is made from the main process.
   */
  async fetchAudioUrls(vanisourceUrl) {
    const pageTitle = decodeURIComponent(vanisourceUrl.split('/wiki/').pop() ?? '');
    const apiUrl =
      'https://vanisource.org/w/api.php?action=parse' +
      `&page=${encodeURIComponent(pageTitle)}&prop=wikitext&format=json`;

    let wikitext = '';
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const body = await getText(apiUrl);
        wikitext = JSON.parse(body)?.parse?.wikitext?.['*'] ?? '';
        lastErr = undefined;
        break;
      } catch (e) {
        lastErr = e;
        if (attempt < 2) await delay(1500 * (attempt + 1));
      }
    }
    if (lastErr) throw lastErr;

    const urls = [...wikitext.matchAll(/<mp3player>(.*?)<\/mp3player>/g)]
      .map((m) => m[1].trim())
      .filter(Boolean);
    if (urls.length === 0) throw new Error(NO_AUDIO);
    return { urls, wikitext };
  }

  // ------------------------------------------------------------ downloading

  async downloadRecording(id, vanisourceUrl) {
    this.cancelled.delete(id);
    this.setProgress(id, {
      status: 'fetching', partsDone: 0, totalParts: 0, bytesWritten: 0, bytesTotal: 0,
    });

    let audioUrls;
    let wikitext;
    try {
      ({ urls: audioUrls, wikitext } = await this.fetchAudioUrls(vanisourceUrl));
    } catch (e) {
      if (e && e.message === NO_AUDIO) {
        // Recording has no audio on Vanisource — silently skip, don't show as error
        this.clearProgress(id);
      } else {
        this.setProgress(id, {
          status: 'error', partsDone: 0, totalParts: 0, bytesWritten: 0, bytesTotal: 0,
        });
      }
      return;
    }

    if (this.cancelled.has(id)) { this.clearProgress(id); return; }

    const totalParts = audioUrls.length;
    const dir = path.join(this.audioDir, id);
    await fsp.mkdir(dir, { recursive: true });
    if (wikitext) {
      await fsp
        .writeFile(path.join(dir, 'transcript.json'), JSON.stringify({ wikitext }), 'utf8')
        .catch(() => {});
    }

    const partWritten = new Array(totalParts).fill(0);
    const partTotal = new Array(totalParts).fill(0);
    const done = new Array(totalParts).fill(null);

    this.setProgress(id, {
      status: 'downloading', partsDone: 0, totalParts, bytesWritten: 0, bytesTotal: 0,
    });

    const pushProgress = throttle(() => {
      if (this.cancelled.has(id)) return;
      this.setProgress(id, {
        status: 'downloading',
        partsDone: done.filter(Boolean).length,
        totalParts,
        bytesWritten: partWritten.reduce(add, 0),
        bytesTotal: partTotal.reduce(add, 0),
      });
    }, 200);

    const controllers = [];
    this.controllers.set(id, controllers);

    const downloadPart = async (url, i) => {
      const dest = this.partPath(id, i);
      const tmp = `${dest}.part`;

      for (let attempt = 0; attempt < 3; attempt++) {
        if (this.cancelled.has(id)) return false;
        const controller = new AbortController();
        controllers.push(controller);
        try {
          await fsp.rm(tmp, { force: true });

          const { res } = await getStream(url, { signal: controller.signal });
          partTotal[i] = Number(res.headers['content-length'] ?? 0);

          await new Promise((resolve, reject) => {
            const out = fs.createWriteStream(tmp);
            res.on('data', (chunk) => {
              partWritten[i] += chunk.length;
              pushProgress();
            });
            res.on('error', reject);
            out.on('error', reject);
            out.on('finish', resolve);
            res.pipe(out);
          });

          if (this.cancelled.has(id)) { await fsp.rm(tmp, { force: true }); return false; }

          // Only become the real file once the bytes are all down, so a crash
          // mid-download can never leave a truncated MP3 looking complete.
          await fsp.rename(tmp, dest);
          done[i] = path.join(id, `part-${i}.mp3`);
          pushProgress.flush();
          return true;
        } catch {
          partWritten[i] = 0;
          await fsp.rm(tmp, { force: true }).catch(() => {});
          if (attempt < 2) await delay(2000);
        }
      }
      return false;
    };

    const results = await Promise.all(audioUrls.map((url, i) => downloadPart(url, i)));
    this.controllers.delete(id);
    pushProgress.cancel();

    if (this.cancelled.has(id)) { this.clearProgress(id); return; }

    if (!results.every(Boolean)) {
      this.setProgress(id, {
        status: 'error', partsDone: 0, totalParts, bytesWritten: 0, bytesTotal: 0,
      });
      return;
    }

    const rel = done.filter(Boolean);
    let totalBytes = 0;
    for (const r of rel) {
      try {
        totalBytes += (await fsp.stat(path.join(this.audioDir, r))).size;
      } catch {}
    }

    this.relUris[id] = rel;
    this.registry = {
      ...this.registry,
      [id]: { localUris: rel, totalBytes, downloadedAt: new Date().toISOString() },
    };
    await this.persist();
    this.emitRegistry();
    this.clearProgress(id);
  }

  // ------------------------------------------------------------------ queue

  processQueue() {
    if (this.processing) return;
    this.processing = true;

    const tick = () => {
      while (this.activeCount < MAX_CONCURRENT && this.queue.length > 0) {
        const item = this.queue.shift();
        if (this.cancelled.has(item.id)) continue;
        this.activeCount += 1;
        this.downloadRecording(item.id, item.vanisourceUrl).finally(() => {
          this.activeCount -= 1;
          tick();
        });
      }
      if (this.queue.length === 0 && this.activeCount === 0) this.processing = false;
    };

    tick();
  }

  downloadBatch(items) {
    for (const item of items) {
      // Allow re-queuing items that previously errored
      this.cancelled.delete(item.id);
      if (!this.queue.some((q) => q.id === item.id)) this.queue.push(item);
    }
    this.processQueue();
  }

  cancelDownload(id) {
    this.cancelled.add(id);
    this.queue = this.queue.filter((q) => q.id !== id);
    for (const c of this.controllers.get(id) ?? []) c.abort();
    this.controllers.delete(id);
    this.clearProgress(id);
  }

  async deleteDownload(id) {
    await fsp.rm(path.join(this.audioDir, id), { recursive: true, force: true }).catch(() => {});
    const next = { ...this.registry };
    delete next[id];
    this.registry = next;
    delete this.relUris[id];
    await this.persist();
    this.emitRegistry();
  }

  async deleteAll() {
    await fsp.rm(this.audioDir, { recursive: true, force: true }).catch(() => {});
    await fsp.mkdir(this.audioDir, { recursive: true }).catch(() => {});
    this.registry = {};
    this.relUris = {};
    await this.persist();
    this.emitRegistry();
  }
}

/** "part-10.mp3" must sort after "part-9.mp3", which a plain string sort gets wrong. */
function partSort(a, b) {
  const na = Number(a.match(/part-(\d+)/)?.[1] ?? 0);
  const nb = Number(b.match(/part-(\d+)/)?.[1] ?? 0);
  return na - nb;
}

const add = (a, b) => a + b;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Coalesce progress emits. A multi-part lecture fires 'data' thousands of
 * times a second across three parallel downloads; forwarding each one over IPC
 * would spend more time re-rendering the Downloads tab than downloading.
 */
function throttle(fn, ms) {
  let timer = null;
  let pending = false;
  const wrapped = () => {
    if (timer) { pending = true; return; }
    fn();
    timer = setTimeout(() => {
      timer = null;
      if (pending) { pending = false; wrapped(); }
    }, ms);
  };
  wrapped.flush = () => { pending = false; fn(); };
  wrapped.cancel = () => { if (timer) clearTimeout(timer); timer = null; pending = false; };
  return wrapped;
}

module.exports = { DownloadManager, MAX_CONCURRENT };
