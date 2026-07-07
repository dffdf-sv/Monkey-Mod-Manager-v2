# Monke Mod Manager

A web-based mod manager for Gorilla Tag — browse, install, enable, and disable mods sourced from the GORILA-TAG-MODBASE repository.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- Frontend app: `artifacts/monke-mod-manager/src/`
- State/context: `src/lib/store.tsx` — ModStoreProvider using localStorage
- Mod fetching: `src/hooks/use-mods.ts` — fetches from GORILA-TAG-MODBASE GitHub
- Pages: `src/pages/mods.tsx`, `settings.tsx`, `about.tsx`
- Shell/layout: `src/components/shell.tsx`

## Architecture decisions

- Pure frontend app — no backend, no API server calls. Mod list is fetched directly from the raw GitHub JSON URL.
- Install/enable state persisted to localStorage (`monke-installed`, `monke-enabled`, `monke-theme`).
- `toggleInstalled` captures `installed.includes(modName)` synchronously before both `setInstalled` + `setEnabled` calls to prevent stale-closure divergence.
- Malformed mod entries are filtered out at fetch time before reaching the UI.
- Dark mode first; toggled via `document.documentElement.classList` and persisted to localStorage.

## Product

- **Mods page**: Browse all mods from GORILA-TAG-MODBASE with search and category filter tabs. Install/uninstall with one click; installed mods get an enable/disable toggle. Dependency warnings shown inline.
- **Settings page**: Theme toggle, mod source URL display, clear all mods.
- **About page**: App info and links to both GitHub repos.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
