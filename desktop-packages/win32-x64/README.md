# @yonderclaw/desktop-win32-x64

Prebuilt YonderClaw desktop binary for **Windows x64**.

This package is a platform-specific optional dependency of [`create-yonderclaw`](https://www.npmjs.com/package/create-yonderclaw). You should not install it directly.

## How it works

When you run `npx create-yonderclaw`, npm installs the optional dependencies whose `os`/`cpu` match your machine. On Windows x64, that means this package's `bin/yonderclaw-desktop.exe` lands inside `node_modules/@yonderclaw/desktop-win32-x64/bin/`.

The installer locates the binary via `require.resolve('@yonderclaw/desktop-win32-x64/package.json')` and writes a desktop shortcut that launches it directly. If the binary is missing (e.g. on an unsupported platform), the installer falls back to opening the dashboard HTML in your default browser.

## Contents

- `bin/yonderclaw-desktop.exe` — Tauri desktop shell (single-window dashboard + embedded Claude Code PTY).

## License

MIT — Yonder Zenith LLC.

## Project

- Homepage: https://yonderzenith.github.io/YonderClaw/
- Repository: https://github.com/YonderZenith/YonderClaw
