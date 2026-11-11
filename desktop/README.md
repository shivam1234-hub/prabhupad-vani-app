# Prabhupada Vani — Windows desktop build

The same app as the phone build, in a window. There is no second copy of the
UI: Electron loads the Expo **web** export of `app/`, `components/` and
`contexts/` from one folder up, so any change to a screen shows up on Android,
iOS and Windows at once.

---

## Running it on the Windows laptop

You need [Node.js 22+](https://nodejs.org) (the repo pins a version in
`.nvmrc`). Git is optional — a copied folder works fine.

```cmd
cd prabhupad_vani_app
npm install

cd desktop
npm install
npm run dev
```

`npm run dev` rebuilds the web bundle and opens the app. After the first run,
`npm start` alone reopens it without rebuilding.

From the project root, `npm run desktop` does the same thing in one command.

## Building an installer

```cmd
cd desktop
npm run dist
```

This writes two files to `desktop/release/`:

| File | What it is |
| --- | --- |
| `PrabhupadaVani-Setup-1.0.23.exe` | Normal installer — Start-menu and desktop shortcuts, uninstall entry, installs per-user so it needs no admin rights |
| `PrabhupadaVani-1.0.23-portable.exe` | Single file, no install — run it from a USB stick |

Both are x64. On a Snapdragon/ARM laptop the x64 build still runs under Windows
emulation; `npm run dist:arm64` makes a native one if you'd rather.

The installer is **unsigned**, so SmartScreen will show "Windows protected your
PC" the first time. *More info → Run anyway*. Silencing that permanently means
buying a code-signing certificate; it is not a build problem.

---

## What's different from the phone app

Everything the phone app does — search, browse by category, transcripts,
tags, history with resume, watch-with-slides, offline downloads — works here.
Four things are implemented differently because a browser engine cannot do what
a native app does:

| Concern | Phone | Windows |
| --- | --- | --- |
| Playback | `react-native-track-player` | `<audio>` + Media Session API (`contexts/AudioContext.web.tsx`) |
| Lock-screen controls | Media notification | Windows media overlay + hardware media keys, via Media Session |
| Downloads | `expo-file-system` in the app | `desktop/lib/downloads.js` in the Electron main process, mirrored into the UI by `contexts/DownloadContext.web.tsx` |
| Slide videos | `react-native-webview` | `<iframe>` (`components/VideoSlidesView.web.tsx`) |

Downloaded audio lands in
`%APPDATA%\Prabhupada Vani\audio\<recordingId>\part-N.mp3`, with the transcript
saved next to it so downloaded lectures also read offline. **File → Open
Downloads Folder** opens it.

### Keyboard

| Key | Action |
| --- | --- |
| `Space` | Play / pause |
| `←` / `→` | Back / forward 15 seconds |
| `Shift` + `←` / `→` | Slower / faster |
| `Ctrl` + `0` | Normal speed |
| `Ctrl` + `.` | Stop |

The bare keys are bound in the renderer, not as menu accelerators, so they stay
out of the way while you are typing in the search box. The Playback menu lists
`Ctrl`-based equivalents that work regardless of focus.

---

## How it fits together

```
desktop/
  main.js            Window, menu, network allow-list, IPC
  preload.js         The only bridge to Node — contextIsolation is on
  lib/server.js      Serves the bundle and downloaded audio over 127.0.0.1
  lib/downloads.js   Download engine (parallel parts, retries, resume-safe)
  lib/http.js        Redirect-following GET used by the downloader
  scripts/           Builds the Expo web export into desktop/web/
  web/               The export itself — generated, not in git
```

**Why a local HTTP server rather than `file://`?** The export references its JS
with an absolute `/_expo/...` path, expo-router needs the History API, and
YouTube refuses to play an embed whose frame has no real origin — all of which
a `file://` page fails. Serving from `http://127.0.0.1:<random port>` makes the
renderer behave like the ordinary web app the shared code was written against.
The port is bound to loopback only and changes every launch.

**Security posture:** `nodeIntegration` off, `contextIsolation` on, so the
bundle cannot reach `fs` or `ipcRenderer` — only the handful of functions in
`preload.js`. Requests to anything outside Vanisource, its S3 buckets and
YouTube are cancelled outright, and camera/microphone/geolocation prompts are
auto-denied.

## Troubleshooting

**"Web bundle missing" on launch** — run `npm run export` in `desktop/`. The
`web/` folder is generated and deliberately not committed.

**`expo export` fails** — run `npm install` in the project root first; the
export uses the root's Metro and dependencies, not this folder's.

**Audio won't play, transcripts won't load** — check the machine can reach
`vanisource.org`. Lectures stream from S3 unless downloaded first.
