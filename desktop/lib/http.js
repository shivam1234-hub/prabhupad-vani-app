'use strict';

const https = require('node:https');
const http = require('node:http');

const UA = 'PrabhupadaVaniDesktop/1.0 (+https://vanisource.org)';

/**
 * GET a URL, following redirects, and hand the caller the live response stream.
 *
 * Vanisource hands audio off to S3 with a 302, and S3 itself sometimes
 * redirects again between regions, so a plain `https.get` gives you an empty
 * 302 body rather than an MP3. `node:https` does not follow redirects on its
 * own, hence the loop.
 *
 * Resolves with { res, url } where `res` is the final IncomingMessage, still
 * unread — the caller pipes it and reads `content-length` off it for progress.
 */
function getStream(url, { redirects = 0, signal } = {}) {
  return new Promise((resolve, reject) => {
    if (redirects > 8) {
      reject(new Error('Too many redirects'));
      return;
    }

    let target;
    try {
      target = new URL(url);
    } catch {
      reject(new Error(`Bad URL: ${url}`));
      return;
    }

    const mod = target.protocol === 'http:' ? http : https;
    const req = mod.get(
      target,
      { headers: { 'User-Agent': UA, Accept: '*/*' } },
      (res) => {
        const { statusCode, headers } = res;

        if (statusCode >= 300 && statusCode < 400 && headers.location) {
          res.resume(); // drain so the socket can be reused
          const next = new URL(headers.location, target).toString();
          getStream(next, { redirects: redirects + 1, signal }).then(resolve, reject);
          return;
        }

        if (statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${statusCode} for ${target.hostname}`));
          return;
        }

        resolve({ res, url: target.toString() });
      },
    );

    req.setTimeout(45_000, () => req.destroy(new Error('Request timed out')));
    req.on('error', reject);

    if (signal) {
      if (signal.aborted) req.destroy(new Error('Cancelled'));
      else signal.addEventListener('abort', () => req.destroy(new Error('Cancelled')), { once: true });
    }
  });
}

/** GET a URL and buffer the whole body as a UTF-8 string. */
async function getText(url, opts) {
  const { res } = await getStream(url, opts);
  const chunks = [];
  for await (const chunk of res) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

module.exports = { getStream, getText, UA };
