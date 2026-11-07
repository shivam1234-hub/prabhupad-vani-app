import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';

export type DictionaryName = 'wordnet';

// Literal requires so Metro bundles both files as assets.
export const DICTIONARY_ASSETS: Record<DictionaryName, () => number> = {
  wordnet: () => require('../assets/dictionary/wordnet.dict'),
};

/**
 * Read a bundled dictionary file (assets/dictionary/*.dict) as text.
 *
 * They are assets inside the app binary, so this works with no connection. In
 * a dev build `downloadAsync` pulls the file from Metro once; in a release
 * build it just resolves the copy packaged in the APK/IPA. The web/desktop side
 * is in dictionaryLoader.web.ts because expo-file-system has no web
 * implementation.
 */
export async function loadDictionaryText(name: DictionaryName): Promise<string> {
  const asset = Asset.fromModule(DICTIONARY_ASSETS[name]());
  await asset.downloadAsync();
  if (!asset.localUri) throw new Error(`Dictionary asset ${name} has no local file`);
  return FileSystem.readAsStringAsync(asset.localUri);
}
