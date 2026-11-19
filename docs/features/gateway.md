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
- **Canonical home**: `/{locale}/download/` is the indexed face (2026-10-03). `/` and `/{locale}/` canonicalize to it, the sitemap lists it at priority 1 and omits `/{locale}/`, and `pnpm seo:check` holds that after every Pages build.
- **Search reach (2026-11-19)**: every meta description fits 25-160 characters (`fitMetaDescription` in `page-metadata.ts`, after Bing flagged 20 of 152 pages). Each locale's metadata carries `keywords` in the words its searchers type and `brandReading`, the brand as that language reads it aloud in its own script, which the download page's `SoftwareApplication` lists as an `alternateName`; Chinese copy names the Chinese term for a knowledge graph, which Chinese developers search far more than the one for ontology. After each Pages deploy, the pages whose visible text changed against the live site go to IndexNow (`scripts/web/indexnow.mjs`, key served at `/<key>.txt`), so Bing, which also feeds ChatGPT search, and Naver, Yandex and Seznam recrawl them within minutes; Google reads the sitemap.
- **Desktop app, no restored vault** → `FirstRunPage` (start from a code project / just start / open / create), with no bundled sample or workbench rail
- **Recent desktop vaults** → the picker stores recently opened Tauri vault paths, can reopen them without another Finder selection, and can remove stale paths from the list
- **Vault loaded (web or desktop)** → `HomePage` — the topology hub for that vault (map + INDEX concept panel + node datasheet), the same component `/topology` renders (B3 decision ["Don't keep a separate hub; the map takes its place"] — the old tree/ego hub, `OntologyViewPage`, is retired; `/ontology` now redirects here with INDEX expanded). Restoring a previously-opened vault handle from IndexedDB goes straight here — no starter surfaces, no re-clicking through first-run every visit
- **Switch vault mid-session**: the topology settings gear (⚙, top-right utility rail) has a "switch vault" row → `/docs/?intent=local`, alongside the `/docs` vault pill's own "swap" control
