---
title: Guide and changelog
doc_type: feature
status: current
area: product
routes: [/guide, /guide/[segment], /changelog]
---

# Guide and changelog

This file describes the two reading pages the website and the app serve from
repository Markdown: the user guide and the changelog. It is for anyone
changing what those pages show or how they are built.

## What you can do

- **Read the guide.** `/guide` renders the first chapter in place instead of
  redirecting, so a shared `/guide` link keeps its address; a table of contents
  on the left names the current chapter. Each other chapter has its own
  `/guide/[segment]` address. An unknown segment shows the first chapter and
  says that it substituted one.
- **Read what changed recently.** `/changelog` renders the most recent
  sections of `docs/CHANGELOG.md` with a list of entries to jump between, and
  says how many older sections it folded; the full history stays in the
  repository.

## Where it lives

- `app/[locale]/guide/page.tsx`, `app/[locale]/guide/[segment]/page.tsx`,
  `app/[locale]/changelog/page.tsx` — the routes.
- `src/views/gateway-doc/model/guide-pages.ts` — `GUIDE_PAGES`, the chapter
  list; adding a chapter there grows the routes, the table of contents and
  previous/next together. The chapters themselves are `docs/guide/*.md`.
- `src/views/gateway-doc/ui/GatewayDocPage.tsx` — the shared reader for both
  pages (`sidebar` for the guide, `entryNav` and `recentSectionLimit` for the
  changelog).

## Limits

- The changelog page shows a fixed number of recent sections
  (`RECENT_SECTIONS` in `app/[locale]/changelog/page.tsx`); older entries are
  read in the repository.

## Verified by

- `src/views/gateway-doc/model/guide-pages.test.ts` — segment resolution, the
  first-chapter fallback and canonical addresses.
- `src/views/gateway-doc/lib/vault-doc.test.ts` — the bundled document reader.
