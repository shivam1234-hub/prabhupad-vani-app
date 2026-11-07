import { Asset } from 'expo-asset';

export type DictionaryName = 'wordnet';

const DICTIONARY_ASSETS: Record<DictionaryName, () => number> = {
  wordnet: () => require('../assets/dictionary/wordnet.dict'),
};

/**
 * Web/desktop counterpart of dictionaryLoader.ts.
 *
 * The web export copies the dictionary into its assets folder, and the
 * Windows app serves that folder from its own loopback server
 * (desktop/main.js), so this fetch never leaves the machine.
 */
export async function loadDictionaryText(name: DictionaryName): Promise<string> {
  const asset = Asset.fromModule(DICTIONARY_ASSETS[name]());
  const res = await fetch(asset.uri);
  if (!res.ok) throw new Error(`Dictionary asset ${name} returned ${res.status}`);
  return res.text();
}
