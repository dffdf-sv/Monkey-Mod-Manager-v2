# Monkey Mod Manager V2

A fresh React + TypeScript + Vite redesign for the Monkey Mod Manager project.

## Run locally

Requirements: Node.js 18 or newer.

```bash
npm install
npm run dev
```

Create a production build with:

```bash
npm run build
npm run preview
```

## Current prototype features

- Responsive dashboard and mod-card layout
- Search and category filters
- Saved-mod library persisted in browser local storage
- Dark/light theme persisted in browser local storage
- Mod detail dialog and empty states

## Important limitations

This repository currently provides a **web UI prototype**, not a native Gorilla Tag mod installer. The sample catalog is demonstration data; version numbers and descriptions are not verified live release metadata. The Add/Save action only stores items in this browser and does not download, install, update, or remove mod files from a PC.

Before calling this a working installer, the project needs a trusted mod metadata source, release/dependency validation, compatibility checks, safe download handling, and a desktop bridge/installer with explicit user-selected Gorilla Tag paths. Do not treat the sample catalog as a recommendation to install those files.

## Tech stack

- React 18
- TypeScript
- Vite
