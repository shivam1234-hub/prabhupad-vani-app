const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// The offline dictionary (assets/dictionary/wordnet.dict) ships as a bundled
// asset file, not a JS module: at 8 MB it would bloat the JS bundle and be
// parsed at startup. As an asset it is only read the first time someone looks
// a word up (see utils/dictionaryLoader*.ts).
config.resolver.assetExts.push('dict');

module.exports = config;
