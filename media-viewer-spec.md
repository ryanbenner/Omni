# Project: Lightweight Media Viewer & Clip Editor for Windows

## Overview

Build a fast, lightweight Windows desktop app that replaces both Windows Media Player and Clipchamp for the workflow of reviewing gaming clips and photos. The app is a unified media viewer: it opens videos AND images, lets the user flip through everything in the containing folder with arrow keys, and can trim video clips on the fly via ffmpeg.

**Stack: Tauri 2 + Vue 3 (Composition API) + ffmpeg sidecar.** Do not use Electron. Do not decode video in Rust — the WebView2 `<video>` element handles playback; Rust handles filesystem, ffmpeg process spawning, CLI args, and window management.

**Target machine:** Windows 11, NVIDIA RTX 4070 Super (NVENC available for re-encodes). Clips come primarily from ShadowPlay / Game Bar (H.264 MP4, 60fps).

## Code style requirements

- Only make necessary changes to code to achieve the desired functionality; leave unrelated code unchanged.
- Never change existing comments.
- New comments should be simple, lowercase, and contain no emojis.

## Core architecture

- **Media list model:** on open, scan the containing folder of the launched file. Filter to supported extensions, sort by modified date (newest first). Produce one unified array of media items, each with `{ path, kind: 'video' | 'image', name, mtime }`. A single current index drives navigation; prev/next does not care about kind.
- **Viewer switch:** parent `Viewer` component renders `VideoPlayer` or `ImageViewer` via a `v-if`/dynamic component switch on `item.kind`. Both components share the same prop/emit interface so the parent has no kind-specific logic.
- **File loading:** use Tauri's asset protocol (`convertFileSrc`) for both `<video>` and `<img>` sources. Asset protocol scope in `tauri.conf.json` must cover the user's media folders — use a broad scope like `$HOME/**` initially. Range requests must work for seeking large video files.

### Supported extensions

- Video: `mp4`, `mkv`, `mov`
- Image: `jpg`, `jpeg`, `png`, `gif`, `webp`, `bmp`, `heic`

## Features

### Phase 1 — Viewer MVP

1. **Playback (video):** custom controls over a plain `<video>` element.
   - Space: play/pause
   - Left/Right: seek −/+5s; Shift+Left/Right: −/+10s
   - `,` / `.`: frame step (assume 60fps → 1/60s nudge)
   - `<` / `>`: cycle playback speed through 0.25 / 0.5 / 1 / 1.5 / 2
   - Click-to-seek custom timeline (div with progress fill; click sets `video.currentTime`)
   - Volume slider, `M` mute, `F`/double-click fullscreen
2. **Image viewing:**
   - Wheel zoom, drag pan, `0` reset zoom, `F` fit-to-window
   - `R` rotate 90°
   - CSS `image-orientation: from-image` so EXIF-rotated phone photos display correctly
3. **Navigation (both kinds):**
   - PgUp/PgDn: always previous/next file
   - Left/Right on images (and on videos paused at start/end): previous/next file
   - Collapsible sidebar listing folder contents; clicking an item jumps to it
   - Preload adjacent images (`new Image().src`) for instant flipping; do NOT preload videos
4. **Launch handling:**
   - `@tauri-apps/plugin-cli` to receive a file path argument
   - `@tauri-apps/plugin-single-instance` so a second launch forwards its args to the running window (swap to the new file, focus the window) instead of opening a new instance
   - On launch with a path: scan its parent folder, set current index to that file

### Phase 2 — Clip editing

1. **In/out markers:** `I` and `O` set in/out points at `currentTime`, rendered as a highlighted range on the timeline. Draggable handles optional; keyboard is the primary path.
2. **ffmpeg sidecar:** bundle `ffmpeg.exe` as a Tauri sidecar. Two export modes, clearly labeled in the UI:
   - **Fast (stream copy):** `ffmpeg -ss IN -to OUT -i input.mp4 -c copy output.mp4`. Instant, lossless, but cuts snap to nearest keyframe — the UI must indicate this mode is keyframe-accurate only.
   - **Precise (NVENC re-encode):** `ffmpeg -ss IN -to OUT -i input.mp4 -c:v h264_nvenc -preset p4 -cq 23 -c:a copy output.mp4`. Frame-accurate. Show a progress bar by parsing `-progress pipe:1` output.
3. **Output naming:** default to `<originalname>_clip.mp4` next to the source. Never overwrite the original. If the name exists, append `_2`, `_3`, etc.
4. **Extras (after trim works):**
   - Strip/mute audio option on export
   - Export-to-size-target (e.g. under 50MB for Discord): compute video bitrate from target size and trimmed duration, two-pass or single-pass NVENC
   - `S`: screenshot current video frame to PNG next to the source

### Phase 3 — Polish

1. Thumbnails in sidebar: images via lazy `<img>`; videos via ffmpeg frame grab (`-vf fps=1,scale=160:-1 -frames:v 1`), cached in `%APPDATA%/<app>/thumbs/` keyed by path+mtime hash
2. `Del`: delete current file with confirmation dialog (move to Recycle Bin, not permanent delete — use the `trash` crate or equivalent)
3. Persist settings: last folder, window size/position, default export mode, volume
4. Copy image to clipboard action

## Windows integration

- **File associations:** declare all supported extensions in `tauri.conf.json` under `bundle.fileAssociations` with role `Viewer` so the installer registers ProgIDs and the app appears in "Open with" and Windows Default Apps.
- Windows requires the user to choose the default manually; add a settings button that opens `ms-settings:defaultapps` to make this easy.

## Known gotchas — handle these

- **HEVC video:** WebView2 only plays HEVC if the Microsoft Store "HEVC Video Extensions" are installed. If a video fails to load, detect it and show a helpful message naming the extension (do the same for HEIC images / "HEIF Image Extensions"). Do not silently fail.
- **Keyframe snapping:** in stream-copy mode the actual cut point can differ from the marker by 1–2s. Surface this in the UI.
- **Asset protocol scope:** if a folder is outside scope, media silently fails to load — verify scope covers common locations (Videos, Pictures, Desktop, Downloads).
- **Large images:** 4K PNG screenshots can be 10–20MB; preload only immediate neighbors.

## Order of work

1. Scaffold with `create-tauri-app` (Vue + TypeScript). Get one hardcoded clip playing in a `<video>` tag via asset protocol.
2. Folder scan → unified media list → prev/next + kind switch.
3. ImageViewer (pan/zoom/rotate) and VideoPlayer (custom controls + timeline).
4. Unified keyboard shortcuts.
5. CLI arg + single-instance + file associations; verify "Open with" flow end to end.
6. ffmpeg sidecar + stream-copy trim with in/out markers.
7. NVENC precise mode + progress bar.
8. Thumbnails, delete-to-recycle-bin, settings persistence, preloading.

Complete steps in order and verify each works before moving on. Steps 1–5 constitute a usable daily-driver viewer; treat that as the first milestone.
