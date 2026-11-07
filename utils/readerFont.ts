/**
 * Typeface for transcript prose.
 *
 * Native keeps `Georgia`, which is what this app has always asked for. Note
 * that the two mobile platforms already disagree about what that means: iOS
 * ships Georgia and renders a serif, while Android has no Georgia and nothing
 * is bundled, so React Native silently falls back to the default sans (Roboto).
 * The APK has therefore always been sans-serif.
 *
 * The web/desktop build is the first one running on an engine that honours the
 * request, which made Windows the odd one out against the phone everyone
 * actually uses — see readerFont.web.ts for what it does instead.
 */
export const READER_FONT_FAMILY = 'Georgia';

/** Base size the reader scale multiplies, before any wide-screen adjustment. */
export const READER_BASE_FONT_SIZE = 14;

/** Above this viewport width, treat the layout as desktop rather than phone. */
export const WIDE_LAYOUT_BREAKPOINT = 900;
