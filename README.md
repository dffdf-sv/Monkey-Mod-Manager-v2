# Monkey Mod Hub V2

A compact Gorilla Tag PC mod hub with a web catalogue, thumbnails, source links, browser downloads, a protected curator panel, and an Electron desktop installer.

## Run locally

Use Node.js 20 or newer.

Terminal 1 — API for the Vite dev server:
    npm install
    npm run server:dev

Terminal 2 — frontend:
    npm run dev

Production:
    npm install
    npm run build
    npm start

## Deploy on Render

The repository contains render.yaml for a free Render web service. Create a new Blueprint from this repository, then set these two secret environment variables in the Render service:

- ADMIN_PASSWORD: a strong password used by the curator page.
- GITHUB_TOKEN: a fine-grained GitHub token restricted to dffdf-sv/GORILA-TAG-MODBASE, with Contents: Read and write permission.

The app reads modinfo.Json from the mod-base repository. Publishing or removing a mod through Admin · Add mods commits the metadata file back to that repository, so the catalogue survives Render restarts without relying on an ephemeral filesystem. Never put GITHUB_TOKEN in frontend code or in a committed file.

The curator form accepts a mod name, author, version, category, description, HTTPS direct download URL, optional HTTPS image/source URLs, and dependency names. It stores metadata only; binaries remain at their trusted upstream download URL. Use official releases and only add binaries you trust.

## Mod install behaviour

- Website: opens the upstream HTTPS download. Browsers cannot silently write into a local Gorilla Tag installation.
- Desktop app: the user explicitly selects their Gorilla Tag game folder. A direct DLL download is copied to BepInEx/plugins; a ZIP is extracted into the selected game root. Only HTTPS, DLL, and ZIP are accepted, with a download size limit. Dependencies are displayed but must be installed in the right order.
- If a game folder has no BepInEx installation yet, install BepInEx first. Back up game files before installing mods.

## Desktop builds

The GitHub Actions workflow builds a Windows x64 EXE installer and Linux x64 AppImage / DEB packages from Actions > Desktop builds > Run workflow or by pushing a v* tag. Build outputs are workflow artifacts; they are not created until the workflow completes successfully.

## Data source and disclaimer

The catalogue is backed by dffdf-sv/GORILA-TAG-MODBASE (modinfo.Json). The repository should contain one JSON array. No affiliation with or endorsement by Another Axiom is implied. Mod compatibility and safety are the responsibility of each mod's author; check the upstream release page before installing.
