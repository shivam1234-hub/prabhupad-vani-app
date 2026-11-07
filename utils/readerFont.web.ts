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
 */
export const READER_FONT_FAMILY =
  'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export const READER_BASE_FONT_SIZE = 14;

export const WIDE_LAYOUT_BREAKPOINT = 900;
