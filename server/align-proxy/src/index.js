// Forced-alignment proxy: fetches lecture audio server-side (bypassing the
// browser CORS restriction vanisource's S3 bucket doesn't lift) and forwards
// it to Groq's Whisper endpoint for word-level timestamps. Keeps the Groq API
// key server-side only — never shipped in the app bundle.
//
// Request:  POST { audioUrl: string }
// Response: { words: [{ word, start, end }, ...] }

const ALLOWED_HOST = 's3.amazonaws.com';
const ALLOWED_PATH_PREFIX = '/vanipedia/';
const GROQ_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const GROQ_MODEL = 'whisper-large-v3-turbo';
const MAX_BYTES = 25 * 1024 * 1024; // Groq's transcription size limit

function withCors(body, init) {
  const headers = new Headers(init?.headers);
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'content-type');
  return new Response(body, { ...init, headers });
}

function errorResponse(status, message) {
  return withCors(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return withCors(null, { status: 204 });
    if (request.method !== 'POST') return errorResponse(405, 'Method not allowed');

    let audioUrl;
    try {
      ({ audioUrl } = await request.json());
    } catch {
      return errorResponse(400, 'Invalid JSON body');
    }
    if (typeof audioUrl !== 'string') return errorResponse(400, 'audioUrl is required');

    let parsed;
    try {
      parsed = new URL(audioUrl);
    } catch {
      return errorResponse(400, 'audioUrl is not a valid URL');
    }
    // Restrict to vanisource's known audio bucket so this can't be used as an
    // open proxy to burn the (free-tier) Groq key against arbitrary audio.
    if (parsed.hostname !== ALLOWED_HOST || !parsed.pathname.startsWith(ALLOWED_PATH_PREFIX)) {
      return errorResponse(403, `URL not allowed: ${parsed.hostname}${parsed.pathname}`);
    }

    const audioRes = await fetch(audioUrl);
    if (!audioRes.ok) return errorResponse(502, `Failed to fetch audio (${audioRes.status})`);

    const contentLength = Number(audioRes.headers.get('content-length') || '0');
    if (contentLength > MAX_BYTES) {
      return errorResponse(413, 'Audio file exceeds the 25MB transcription limit');
    }
    const audioBlob = await audioRes.blob();

    const form = new FormData();
    form.append('file', audioBlob, 'lecture.mp3');
    form.append('model', GROQ_MODEL);
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'word');

    const groqRes = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.GROQ_API_KEY}` },
      body: form,
    });
    if (!groqRes.ok) {
      const detail = await groqRes.text().catch(() => '');
      return errorResponse(502, `Groq transcription failed (${groqRes.status}): ${detail.slice(0, 300)}`);
    }

    const json = await groqRes.json();
    return withCors(JSON.stringify({ words: json.words ?? [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  },
};
