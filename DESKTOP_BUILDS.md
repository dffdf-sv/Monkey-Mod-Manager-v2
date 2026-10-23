# Desktop builds

Monkey Mod Manager V2 is packaged as an Electron desktop app.

## Windows

```bash
npm install
npm run dist:win
```

Produces a Windows x64 NSIS installer in `release/` (a `.exe` file).

## Linux

```bash
npm install
npm run dist:linux
```

Produces an x64 AppImage and Debian `.deb` package in `release/`. The AppImage is suitable for many distributions; the `.deb` is intended for Debian/Ubuntu-based distributions.

## Build automatically with GitHub Actions

Open **Actions → Desktop builds → Run workflow** to build both platforms. The Windows installer and Linux packages are uploaded as workflow artifacts. Alternatively, push a tag such as `v2.0.0` to trigger builds automatically.

The first build downloads Electron and packaging dependencies, so it requires internet access. These builds package the current UI prototype. They do not yet install actual Gorilla Tag mods.
