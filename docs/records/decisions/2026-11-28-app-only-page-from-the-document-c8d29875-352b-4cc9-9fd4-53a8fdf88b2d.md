---
id: c8d29875-352b-4cc9-9fd4-53a8fdf88b2d
date: 2026-11-28
---
## 2026-11-28 — A plain browser gets the app-only page from the document and never mounts a workbench

**Why**: with the browser workbench gone (`ce69837e`), an app address opened in a plain browser must say the app is needed at first paint and with scripts off, and no code that opens or remembers a folder may run there. A client redirect fails the first; a runtime flag read inside the vault provider fails the second.
**Prior**: builds the mechanism for `ce69837e`. It drops the catalog and vault inputs of `isGatewaySurface`, which let a browser with a remembered folder reach the map at `/`.
**Decision**: `app/[locale]/layout.tsx` wraps its provider tree in `AppAddressFaces`. Each app address's HTML holds `AppOnlyPage` (server markup) and the workbench; the boot script's `data-shell` mark picks the painted face through CSS. In a plain browser the workbench sits under a `Suspense` that suspends on a never-settling promise, so React keeps the server HTML dehydrated and no provider, catalog fetch or vault restore runs; the boundary sits above both providers for that reason. `/` stays visible and sends a plain browser to `/<locale>/download/`. A plain browser deletes the old `demo-kv` IndexedDB. App addresses and the `/ontology*` redirects are `noindex` with no canonical. `/sample` is a gateway-group page with a client map and compact panel. `/project/[slug]` routes are deleted.
**Dissent**: `window.location.replace` at `/` costs one document load, but the locale-aware router does not exist above the intl provider. The hold relies on React keeping dehydrated HTML, observed rather than documented; `tests/e2e/app-shell/app-document-load.spec.ts` fails if it changes.
**Falsifier**: a plain browser mounts a workbench component or reads `demo-kv` after the cleanup, or the installed app shows the app-only page for any frame.
**Owner**: stark (through the lead's brief for slice 3 of `docs/specs/2026-11-27-remove-browser-workbench.md`)
