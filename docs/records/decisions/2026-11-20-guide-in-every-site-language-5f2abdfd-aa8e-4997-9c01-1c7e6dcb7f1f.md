---
id: 5f2abdfd-aa8e-4997-9c01-1c7e6dcb7f1f
date: 2026-11-20
---
## 2026-11-20 — The guide is written in every site language, and rewritten to the app as it is

**Why**: the owner wants Atlas found by a plain search for "ontology" in Korea, Japan, China and the United States. Every `/ko`, `/ja` and `/zh` guide page served the English body under a "shown in its English original" note, so a search in those languages met a page in another one. The English chapters also described retired surfaces (a popup tour, the Studio route, shape rules the Flat map no longer draws). The owner: "if it is local, it has to be completely local", and rebuild the guide to today's product.
**Prior**: keeps 2026-07-31 "Split the guide into chapters": `GUIDE_PAGES` stays the one list and no segment is renamed, because those addresses are indexed. Amends 2026-08-23 (102) "Make all active authored Markdown English" on a ground it did not weigh, search reach: its dissent foresaw a Korean reader meeting English, and this is that case. Like 2026-10-02 "The README is a short front door", `docs-i18n/guide/{ko,ja,zh}/` joins the localized data beside `README.{ko,ja,zh}.md`.
**Decision**: the English chapters stay vault documents in `docs/guide/`; Korean, Japanese and Chinese bodies live in `docs-i18n/guide/<locale>/<segment>.md`, outside the vault so the Library and MCP keep one guide, read at build time by the guide routes. A chapter without its translation falls back to the English body and keeps the note. A contract holds every chapter in every language with the English section count; `pnpm docs:language` exempts exactly that folder shape. All thirteen chapters were rewritten against the code, and a new second chapter, "What is an ontology?", answers the generic search in four languages.
**Dissent**: four copies of every chapter drift unless each English edit carries its translations. Nothing detects a changed fact: the section count catches only a dropped or added section, and the rule that an English edit carries its translations rests on review.
**Falsifier**: eight weeks after deploy, the Korean, Japanese and Chinese guide pages earn no impressions in Search Console or Bing for that language's word for ontology; then the translations do not buy reach and their upkeep is not worth it.
**Owner**: Stark
