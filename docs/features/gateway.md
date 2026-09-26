---
title: Smart entry
doc_type: feature
status: current
area: product
routes: [/]
---

# Smart entry

### `/` — Smart entry

- **Hosted web, no vault** → the **gateway face** — headline, download, and "open it in the browser" — the same view `/download` renders (2026-07-30 — reversed the previous decision to open the map directly from the root). Judged by `isGatewaySurface()`.
- **Desktop app, no restored vault** → `FirstRunPage` (just start / open / create), with no bundled sample or workbench rail
- **Recent desktop vaults** → the picker stores recently opened Tauri vault paths, can reopen them without another Finder selection, and can remove stale paths from the list
- **Vault loaded (web or desktop)** → `HomePage` — the topology hub for that vault (map + INDEX concept panel + node datasheet), the same component `/topology` renders (B3 decision ["Don't keep a separate hub; the map takes its place"] — the old tree/ego hub, `OntologyViewPage`, is retired; `/ontology` now redirects here with INDEX expanded). Restoring a previously-opened vault handle from IndexedDB goes straight here — no starter surfaces, no re-clicking through first-run every visit
- **Switch vault mid-session**: the topology settings gear (⚙, top-right utility rail) has a "switch vault" row → `/docs/?intent=local`, alongside the `/docs` vault pill's own "swap" control
