/**
 * Web/desktop counterpart of readerFont.ts.
 *
 * Asking for `Georgia` here would be honoured — Chromium has it on both
 * Windows and macOS — and that is exactly the problem: it would make the
 * desktop app the only build showing a serif, because Android (the APK
 * everyone tests against) has no Georgia and falls back to Roboto.
 *
 * So the web build asks for the platform's own UI sans, which is what the APK
 * effectively renders: Segoe UI on Windows, Roboto where present, San
 * Francisco on a Mac. react-native-web passes this straight through to CSS
 * `font-family`, so the browser picks the first one installed.
 *
 * Inter comes first: it is bundled with the desktop app (public/fonts,
 * @font-face in components/desktop/css.ts), so Windows no longer depends on
 * which system UI font the PC's locale hands Chromium.
 */
export const READER_FONT_FAMILY =
  '"Inter Variable", "Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif';

export const READER_BASE_FONT_SIZE = 14;

export const WIDE_LAYOUT_BREAKPOINT = 900;
