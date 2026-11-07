import * as FileSystem from 'expo-file-system/legacy';

/**
 * Read the wikitext saved next to a downloaded recording, if it is there.
 *
 * The downloader writes `audio/<id>/transcript.json` alongside the MP3 parts
 * so a downloaded lecture reads offline as well as it plays. Where that file
 * lives is the one part of the lookup that differs by platform — app sandbox
 * here, Electron's userData folder on Windows (see localTranscript.web.ts) —
 * so it is split out and `useTranscript` stays single-source.
 *
 * Returns null whenever there is no local copy; callers fall through to the
 * persisted cache and then the network.
 */
export async function readLocalTranscript(recordingId: string): Promise<string | null> {
  try {
    const localPath = `${FileSystem.documentDirectory}audio/${recordingId}/transcript.json`;
    const info = await FileSystem.getInfoAsync(localPath);
    if (!info.exists) return null;
    const raw = await FileSystem.readAsStringAsync(localPath);
    return JSON.parse(raw)?.wikitext ?? null;
  } catch {
    return null;
  }
}

/**
 * Back-fill the transcript next to an already-downloaded lecture. Called when
 * a downloaded lecture's transcript came from AsyncStorage or the network
 * (usually because the download predated the transcript-alongside-audio
 * feature). No-op if the audio directory doesn't exist — nothing to sit next
 * to. Failures are swallowed since this is best-effort.
 */
export async function writeLocalTranscript(recordingId: string, wikitext: string): Promise<void> {
  try {
    const dir = `${FileSystem.documentDirectory}audio/${recordingId}/`;
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) return;
    await FileSystem.writeAsStringAsync(`${dir}transcript.json`, JSON.stringify({ wikitext }));
  } catch {}
}
