# Omni

Lightweight Windows media viewer for gaming clips and photos. Tauri 2 + Vue 3.

## Getting the Windows installer

Every push to `main` builds an NSIS installer on GitHub Actions:

1. GitHub → Actions → latest `build` run
2. Download the `media-viewer-windows` artifact
3. Unzip and run the `.exe` installer

The installer registers "Open with" entries for mp4/mkv/mov and
jpg/jpeg/png/gif/webp/bmp/heic. Set it as default per-extension in
Windows Settings (the app's empty screen has a shortcut button).

## Development

- `npm install`
- `npm test` — frontend tests
- `cargo test --manifest-path src-tauri/Cargo.toml` — rust tests
- `npm run tauri dev` — run locally
