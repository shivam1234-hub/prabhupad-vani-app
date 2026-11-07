/** The mp3 URLs embedded in a lecture's vanisource wikitext, in part order. */
export async function fetchAudioUrls(vanisourceUrl: string): Promise<string[]> {
  const pageTitle = vanisourceUrl.split('/wiki/')[1] ?? '';
  const apiUrl = `https://vanisource.org/w/api.php?action=parse&page=${pageTitle}&prop=wikitext&format=json&origin=*`;
  const res = await fetch(apiUrl, { headers: { 'User-Agent': 'PrabhupadaVaniApp/1.0' } });
  const json = await res.json();
  const wikitext: string = json?.parse?.wikitext?.['*'] ?? '';
  const matches = [...wikitext.matchAll(/<mp3player>(.*?)<\/mp3player>/g)];
  return matches.map(m => m[1].trim()).filter(Boolean);
}
