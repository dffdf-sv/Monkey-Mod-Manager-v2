# ModHub Native (Rust)

This is the native Rust rewrite track, built separately from the stable v1.7.5 application.

## Stack
- Rust / Cargo
- eframe + egui (native desktop UI, no embedded browser)
- reqwest for HTTPS downloads and catalogue requests
- serde for settings/profile data
- zip for safe archive extraction

## Run locally
```sh
cd native
cargo run
```

## Current prototype
- Native desktop shell with Discover, Installed, Profiles, Configs, and Settings pages
- Reads community catalogue from `dffdf-sv/GORILA-TAG-MODBASE` (`modinfo.Json`)
- Installs HTTPS DLL or ZIP mods into the configured BepInEx/plugins directory
- ZIP extraction rejects paths escaping the install directory
- Stores settings and profile data in the OS user config directory

This is the beginning of the rewrite, not yet a parity replacement for the legacy application. Remaining work includes async downloads, robust game detection, BepInEx/dependency setup, account/cloud sync, full profile switching and config-file management, updater, installer packaging, and tests.
