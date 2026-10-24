# ModHub

## [website](modhub.duckdns.org)

**Manage Gorilla Tag PC mods from one desktop app.** Browse the mod catalogue, install supported mod files into your Gorilla Tag folder, manage installed mods, edit configuration files, and check for app updates.

> ModHub is an independent community project. It is not affiliated with or endorsed by Another Axiom or Gorilla Tag.

## Download

**[Download the latest release](https://github.com/dffdf-sv/ModHub-v2/releases/latest)**

Choose the installer for your operating system:

- **Windows:** `ModHub-Setup-<version>-x64.exe`
- **Linux:** `ModHub-<version>-x64.AppImage` or the `.deb` package for Debian/Ubuntu-based systems.

Download installers from this repository's Releases page. Avoid unofficial mirrors. If no release is available yet, check the [GitHub Actions build page](https://github.com/dffdf-sv/ModHub-v2/actions/workflows/desktop-build.yml) for build status.

## Windows: getting started

1. Download and run the Windows `.exe` installer from the Releases page.
2. Follow the installer prompts. You can choose the install location.
3. Open **ModHub** from the Start menu or desktop shortcut.
4. Open **Settings** and confirm the correct Gorilla Tag edition is selected:
   - **SteamVR** for the Steam PC version.
   - **Meta** for the Meta Quest Link / Oculus PC version.
5. Check the detected game folder. If it is wrong or empty, select **Choose folder…** and choose the folder containing Gorilla Tag.
6. Browse the catalogue and install mods you want. Follow any dependency instructions shown by the app.

The manager may ask to install BepInEx if it cannot find it in the selected game folder. Read the mod's own instructions before installing, and back up your game files first.

## What the desktop app can do

- Browse the mod catalogue and open upstream source/download pages.
- Install supported DLL mods and ZIP archives into the selected Gorilla Tag installation.
- Detect installed mod files under `BepInEx/plugins`.
- View and edit BepInEx `.cfg` files; an existing config is backed up before the app overwrites it.
- Select the Steam or Meta PCVR installation and choose a folder manually.
- Check for app and tracked mod updates.
- Sign in with GitHub when using features that require an account.
- Download desktop app updates through the built-in updater when a compatible update is published.

### Updating ModHub

Open **Settings → Check app + mod updates**. Turn on **Automatically download and install app updates** if you want the app to download an available update and restart to install it. Otherwise, you can approve the download and choose when to restart.

The built-in updater works with the packaged desktop application, not a development run. Close the app only when asked to restart for an update. Keep the app installed in its normal installer-managed location so the updater can replace it.

### Installing mods safely

- Install mods only from sources you trust and check the mod author's supported game and BepInEx versions.
- Only use files you have permission to download and install. A mod may stop working after a Gorilla Tag update.
- Some mods need dependencies or manual setup. Installing a file does not guarantee that the mod is compatible.
- The web version cannot silently install files into a local game folder; use the desktop app for local installation.
- Back up `BepInEx/config` and important game files before changing mods or configs.

## Linux

- **AppImage:** download the `.AppImage`, make it executable, then run it. For example:

  ```bash
  chmod +x ModHub-*.AppImage
  ./ModHub-*.AppImage
  ```

- **Debian/Ubuntu:** install the `.deb` package with your distribution's package installer.

The built-in updater is supported by the AppImage build. For `.deb` installations, install newer packages from the Releases page if automatic updating is not available.

## Troubleshooting

**The app cannot find Gorilla Tag:** Open Settings, select the right platform, and use **Choose folder…**. Select the game directory itself, not the parent Steam library folder.

**A mod will not install or load:** Confirm that BepInEx is installed, check the mod's requirements, and make sure the file is intended for your game version. Some ZIP archives contain additional nested archives; only compatible plugin DLLs can be loaded by BepInEx.

**The app updater reports an error:** Check your internet connection and the latest release assets. Updates require a published GitHub Release with the platform's updater metadata. If the update still fails, download the latest installer/package from the Releases page and install it over your current version.

**The app will not launch:** Download a fresh installer from the official Releases page. If you report a bug, include your operating system, app version, the action you took, and the exact error message. Do not post access tokens, passwords, or other secrets.

## Privacy and accounts

GitHub sign-in uses GitHub's authorization flow; ModHub does not ask for or store your GitHub password. Never share your GitHub access token or put secrets in screenshots or issue reports.

## Developers and build instructions

Requirements: Node.js 22 or newer and npm.

```bash
npm install
npm run dev
```

The development web server starts with Vite. To run the API locally as well, open another terminal and run:

```bash
npm run server:dev
```

To build the web UI and desktop app packages:

```bash
npm run build
npm run dist:win    # Windows x64 installer (run on Windows)
npm run dist:linux  # Linux AppImage and .deb (run on Linux)
```

The prebuild step generates `build/icon.png` and `build/icon.ico` from the existing logo at `public/image.jpg`, so the desktop window, Windows installer, and Linux package use the same branding.

### GitHub Actions release workflow

1. Open [Build and publish desktop release](https://github.com/dffdf-sv/ModHub-v2/actions/workflows/desktop-build.yml).
2. Select **Run workflow** and enter a new version such as `v2.0.2` using the `vMAJOR.MINOR.PATCH` format.
3. The workflow prepares the GitHub Release, builds Windows and Linux packages, and publishes their installer files and updater metadata.
4. Wait for both platform jobs to finish before distributing the release.

A tag push beginning with `v` also triggers the workflow; the workflow validates that the tag is a three-part numeric version. Do not reuse a version that already has a published release.

## Catalogue and web deployment

The catalogue is backed by the `dffdf-sv/GORILA-TAG-MODBASE` repository. The web service can be deployed using `render.yaml`. Server-only environment variables such as `ADMIN_PASSWORD`, `GITHUB_TOKEN`, `RENDER_API_KEY`, and OAuth secrets must be configured in the hosting provider and must never be committed to source code or exposed in frontend code.

For web curator setup and server environment details, see the deployment notes in the repository history or ask a maintainer. The desktop app can be used independently of the hosted curator tools.
