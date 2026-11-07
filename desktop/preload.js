'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/**
 * The only bridge between the Expo bundle and Node.
 *
 * The window runs with contextIsolation on and nodeIntegration off, so the
 * renderer — which is the unmodified mobile codebase — can never touch `fs`,
 * `child_process` or `ipcRenderer` directly. Everything it is allowed to do
 * with the machine is on this object, and the shared code only ever reaches
 * for it behind a `window.desktop` check, so the same bundle still runs in a
 * plain browser with these features simply absent.
 */
const desktop = {
  isDesktop: true,
  platform: process.platform,
  version: ipcRenderer.sendSync('desktop:version'),

  downloads: {
    /** Full snapshot, used once on mount before the event streams take over. */
    getState: () => ipcRenderer.invoke('downloads:getState'),
    download: (id, vanisourceUrl) => ipcRenderer.invoke('downloads:download', id, vanisourceUrl),
    batch: (items) => ipcRenderer.invoke('downloads:batch', items),
    cancel: (id) => ipcRenderer.invoke('downloads:cancel', id),
    remove: (id) => ipcRenderer.invoke('downloads:delete', id),
    removeAll: () => ipcRenderer.invoke('downloads:deleteAll'),
    openFolder: () => ipcRenderer.invoke('downloads:openFolder'),
    /** Wikitext saved beside a downloaded lecture, so transcripts read offline. */
    readTranscript: (id) => ipcRenderer.invoke('downloads:readTranscript', id),

    onRegistry: (cb) => subscribe('downloads:registry', cb),
    onProgress: (cb) => subscribe('downloads:progress', cb),
  },

  /**
   * Native Windows message boxes. React Native's Alert compiles down to an
   * empty function on react-native-web, so without this every confirmation in
   * the app (delete a download, clear history) would silently do nothing.
   * Resolves with the index of the button pressed.
   */
  dialog: {
    show: (opts) => ipcRenderer.invoke('dialog:show', opts),
  },

  /** Playback commands from the application menu and its keyboard shortcuts. */
  onCommand: (cb) => subscribe('app:command', cb),
};

/**
 * Wrap an ipcRenderer listener so the renderer never sees the IpcRendererEvent
 * (which carries `sender` and would hand a bundle back a way out of the
 * sandbox), and hand back an unsubscribe function for useEffect cleanup.
 */
function subscribe(channel, cb) {
  const listener = (_event, payload) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('desktop', desktop);
