import type { DesktopUI } from './types';

/**
 * Phones (Android/iOS) get no desktop UI: Metro picks index.web.ts for the
 * web export (which is what the Windows app runs), and this file everywhere
 * else, so none of the desktop screens are bundled into the APK.
 */
export const Desktop: DesktopUI | null = null;
