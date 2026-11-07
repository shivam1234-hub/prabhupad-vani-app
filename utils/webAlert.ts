/**
 * Native builds get a real Alert from React Native, so there is nothing to do.
 * The web/desktop implementation lives in webAlert.web.ts; Metro picks that
 * file automatically via the `.web` platform extension.
 */
export function installWebAlert(): void {}
