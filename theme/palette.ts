/**
 * Colour tokens for the light and dark themes.
 *
 * Every token's `dark` value is exactly the literal that used to be hard-coded
 * at that call site, so switching the app to tokens changed nothing visually —
 * the dark theme is the same pixels it always was. The `light` column is the
 * new work.
 *
 * Tokens are named by *role*, not by shade, because the same hex did several
 * different jobs in the old code. `#fff`, for instance, was both the page
 * heading colour (which must go dark on a light background) and the label on
 * an orange button (which must stay white in both themes) — those are
 * `textPrimary` and `onAccent` here, and conflating them is exactly the bug
 * this split exists to prevent.
 *
 * The light palette is a warm off-white rather than pure white: these are long
 * reading sessions, and #fff at full brightness is fatiguing next to the dark
 * charcoal body text.
 */

export interface ThemeColors {
  // Surfaces, from the page backdrop up to the most raised card
  bg: string;
  bgDeep: string;
  bgDeepAlt: string;
  surfaceSunken: string;
  surface: string;
  surfaceAlt: string;
  surfaceAlt2: string;
  surfaceAlt3: string;
  card: string;
  cardAlt: string;
  cardRaised: string;
  cardAccent: string;
  elevated: string;
  elevatedAlt: string;
  elevatedAlt2: string;
  elevatedAlt3: string;
  elevatedStrong: string;
  elevatedStrong2: string;
  elevatedStrongest: string;

  // Hairlines and outlines
  border: string;
  borderStrong: string;
  borderStronger: string;
  borderMuted: string;

  // Text, brightest to faintest
  textPrimary: string;
  textHigh: string;
  textSecondary: string;
  textBody: string;
  textTertiary: string;
  textQuaternary: string;
  textQuinary: string;
  textMuted: string;
  textMutedBlue: string;
  textMutedBlue2: string;
  textDim: string;
  textDimmer: string;
  textFaint: string;
  textFaintest: string;
  textBullet: string;
  textAaa: string;

  // Brand and semantic colours
  accent: string;
  onAccent: string;
  gold: string;
  goldBorder: string;
  headerGold: string;
  speaker: string;
  success: string;
  successDim: string;
  danger: string;
  dangerAlt: string;
  dangerBg: string;
  dangerBgDeep: string;
  link: string;
  star: string;
  warnBg: string;
  warnBgDim: string;
  highlightBg: string;
  highlightText: string;
  paper: string;
  shadow: string;
  videoBg: string;
  overlaySubtle: string;
}

export const darkColors: ThemeColors = {
  bg: '#0a0d1a',
  bgDeep: '#05060f',
  bgDeepAlt: '#07091a',
  surfaceSunken: '#0f1022',
  surface: '#0d1228',
  surfaceAlt: '#0f1228',
  surfaceAlt2: '#0f1326',
  surfaceAlt3: '#10152a',
  card: '#121629',
  cardAlt: '#13172e',
  cardRaised: '#141830',
  cardAccent: '#16213e',
  elevated: '#1e2545',
  elevatedAlt: '#1e2840',
  elevatedAlt2: '#1e2a4a',
  elevatedAlt3: '#1e2d55',
  elevatedStrong: '#242a45',
  elevatedStrong2: '#252d4a',
  elevatedStrongest: '#2e3555',

  border: '#1a2040',
  borderStrong: '#2a3050',
  borderStronger: '#3a4060',
  borderMuted: '#4a5270',

  textPrimary: '#ffffff',
  textHigh: '#e8e8f0',
  textSecondary: '#dde2f5',
  textBody: '#c8c3ba',
  textTertiary: '#eee',
  textQuaternary: '#ddd',
  textQuinary: '#ccc',
  textMuted: '#888',
  textMutedBlue: '#8890b5',
  textMutedBlue2: '#7a84a8',
  textDim: '#666',
  textDimmer: '#555',
  textFaint: '#444',
  textFaintest: '#333',
  textBullet: '#9a9590',
  textAaa: '#aaa',

  accent: '#ff7722',
  onAccent: '#ffffff',
  gold: '#c8a96e',
  goldBorder: '#c8a96e44',
  headerGold: '#e8a44c',
  speaker: '#88c4a8',
  success: '#27ae60',
  successDim: '#3a6a50',
  danger: '#e74c3c',
  dangerAlt: '#e05',
  dangerBg: '#4a1a1a',
  dangerBgDeep: '#2a0d0d',
  link: '#4a90d9',
  star: '#ffd700',
  warnBg: '#3a3200',
  warnBgDim: '#1e1a00',
  highlightBg: '#FFD700',
  highlightText: '#000',
  paper: '#f0ede6',
  shadow: '#000',
  videoBg: '#000',
  overlaySubtle: '#ffffff14',
};

export const lightColors: ThemeColors = {
  // Warm paper tones. The ladder keeps the same relative ordering as dark:
  // `bg` is the backdrop, cards sit *above* it (brighter), and `elevated*`
  // steps get progressively more contrast against the page.
  bg: '#f7f5f1',
  bgDeep: '#ebe8e1',
  bgDeepAlt: '#f1efe9',
  surfaceSunken: '#efece6',
  surface: '#ffffff',
  surfaceAlt: '#fdfcfa',
  surfaceAlt2: '#faf9f6',
  surfaceAlt3: '#f8f6f2',
  card: '#ffffff',
  cardAlt: '#fdfcfa',
  cardRaised: '#ffffff',
  cardAccent: '#f2eee7',
  elevated: '#ece8e0',
  elevatedAlt: '#eae6de',
  elevatedAlt2: '#e8e4db',
  elevatedAlt3: '#e5e0d6',
  elevatedStrong: '#e3ded4',
  elevatedStrong2: '#e0dbd0',
  elevatedStrongest: '#dbd5c9',

  border: '#e0dcd3',
  borderStrong: '#cfc9bd',
  borderStronger: '#b9b2a4',
  borderMuted: '#a49c8d',

  // Charcoal rather than black — softer against warm paper, and it keeps the
  // same "brightest to faintest" ordering the dark ramp has.
  textPrimary: '#221f1b',
  textHigh: '#2b2823',
  textSecondary: '#35312b',
  textBody: '#3a362f',
  textTertiary: '#403b34',
  textQuaternary: '#474138',
  textQuinary: '#4e483e',
  textMuted: '#6a645a',
  textMutedBlue: '#65605a',
  textMutedBlue2: '#6f6a62',
  textDim: '#7a7469',
  textDimmer: '#888176',
  textFaint: '#968f83',
  textFaintest: '#a49d90',
  textBullet: '#655f57',
  textAaa: '#5c5750',

  // Brand orange is the app's identity and reads well on both, so it does not
  // change. Anything sitting *on* the accent keeps its white text.
  accent: '#ff7722',
  onAccent: '#ffffff',
  // The golds and greens are tuned for a dark backdrop; on paper they need to
  // go considerably deeper to stay legible.
  gold: '#8a6a25',
  goldBorder: '#c8a96e66',
  headerGold: '#a3690f',
  speaker: '#1d6f4a',
  success: '#1e8a4c',
  successDim: '#8fbfa4',
  danger: '#c0392b',
  dangerAlt: '#c40040',
  dangerBg: '#fbe6e3',
  dangerBgDeep: '#f7d9d5',
  link: '#1a63a8',
  star: '#b8860b',
  warnBg: '#fdf3c4',
  warnBgDim: '#fdf9e0',
  highlightBg: '#ffd84d',
  highlightText: '#000',
  paper: '#f0ede6',
  shadow: '#000',
  videoBg: '#000',
  overlaySubtle: '#00000010',
};

export type ThemeMode = 'light' | 'dark' | 'system';
