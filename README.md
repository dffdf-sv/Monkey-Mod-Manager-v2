# Monkey Mod Manager

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

The curator/creator form supports mod metadata, editing, a primary product image, a gallery of up to eight images, a preview video, dependencies and JSON configuration fields. Creator uploads are committed into `mods/<mod-name>/<kind>/` in the GitHub mod-base repository. Upload limits: images 8 MB each, MP4/WebM video 12 MB, and DLL/ZIP mod files 24 MB. Only upload files you have permission to distribute and have checked for safety.

### Render variable manager
After the service is deployed, create a Render API key in your Render account settings and add these environment variables to the **Monkey Mod Hub web service** in the Render dashboard:
- `RENDER_API_KEY`: the Render API key (keep it server-side; never put it in the frontend or desktop app).
- `RENDER_SERVICE_ID`: this web service's ID, available from its Render service page/URL.

Save and deploy the service after adding them. Unlock Admin · Add mods, then use **Manage variables** to set service variables such as `ADMIN_PASSWORD`. Existing variable values are never displayed by the app; choose a variable and enter its new value. Saving requests a Render deployment so the new value becomes active. This integration manages variables attached directly to the service, not variables inherited from environment groups. Treat the Render API key as a powerful secret.



### Creator accounts
Creator sign-in uses GitHub OAuth; it does not store GitHub passwords. Create a GitHub OAuth App with homepage URL `https://monkey-mod-hub.onrender.com` and callback URL `https://monkey-mod-hub.onrender.com/auth/github/callback`. In Render set `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET`, and a long random `SESSION_SECRET`. The GitHub OAuth app only requests public profile access. The existing `GITHUB_TOKEN` remains server-side and must have Contents read/write access to `dffdf-sv/GORILA-TAG-MODBASE`. Each signed-in creator can edit/remove their own entries; the admin password can manage all entries.

## Mod install behaviour

- Website: opens the upstream HTTPS download. Browsers cannot silently write into a local Gorilla Tag installation.
- Desktop app: the manager attempts to auto-detect the Gorilla Tag Steam folder, and lets the user select it manually if needed. DLL files are copied into `BepInEx/plugins/<Mod Name>/`; ZIPs are extracted into that mod's own folder. The app detects DLLs/folders under `BepInEx/plugins`. The desktop-only **CFG editor** lists `.cfg` files in `BepInEx/config`, lets users view and edit them, and creates a `.bak` copy before overwriting an existing file. Configuration settings authored in the catalogue can be saved as a generated file under `BepInEx/config`; some mods require their own documented config format, so generated generic settings may not configure every mod automatically. Only HTTPS DLL/ZIP downloads are accepted, with a size limit. Dependencies are displayed but must be installed in the right order.
- If a game folder has no BepInEx installation yet, install BepInEx first. Back up game files before installing mods.

## Numbered desktop releases

Open GitHub Actions and run **Build and publish desktop release**, entering a version such as `2.0.1`. The workflow builds the Windows x64 `.exe` installer and Linux x64 `.AppImage` and `.deb` packages, then publishes all three as downloadable assets on a numbered GitHub Release (for example, `v2.0.1`). It also runs automatically when a `v*` tag is pushed. Both platform builds must succeed before the release is published.

Download published installers from the repository's [Releases page](https://github.com/dffdf-sv/Monkey-Mod-Manager-v2/releases). Workflow run artifacts are temporary build outputs; the numbered Release is the permanent download page.

## Data source and disclaimer

The catalogue is backed by dffdf-sv/GORILA-TAG-MODBASE (modinfo.Json). The repository should contain one JSON array. No affiliation with or endorsement by Another Axiom is implied. Mod compatibility and safety are the responsibility of each mod's author; check the upstream release page before installing.
