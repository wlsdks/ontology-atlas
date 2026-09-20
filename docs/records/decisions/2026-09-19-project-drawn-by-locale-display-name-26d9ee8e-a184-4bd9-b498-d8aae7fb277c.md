---
id: 26d9ee8e-a184-4bd9-b498-d8aae7fb277c
date: 2026-09-19
---
## 2026-09-19 — A project is drawn by its locale display name on every screen

**Why**: On a Korean screen the map, the INDEX and the Library drew the sample project by its Korean `display_ko` word while the projects list and the project page said "Online Store" (the canonical `title`), one file with two names a click apart (measured 2026-09-19). The 2026-08-25 rule is one thing, one word.
**Prior**: 2026-08-25 "One word per thing" stands and is applied here to a project's own name; 2026-09-15 "Projects stays a compact index" stands, the row's word changes, not the row.
**Decision**: `Project` carries `displayNames` read from `display_<locale>` keys, and every place that names a project (list row, page heading and breadcrumb, document title, drawer, map title resolver, search labels) draws `display_<locale>` when present and the canonical name otherwise. Editing the heading in place edits the word the person is looking at: the locale display key when one exists, the canonical name when none does (starter displays keep following a rename). Search still matches the canonical name and every display name.
**Dissent**: none. Nearest objection: the canonical title is what agents and slugs use, and hiding it invites confusion; the reply is that the map already hid it, and the document itself, the Library and the footer slug keep it one click away.
**Falsifier**: a person who renames the heading and sees the map keep the old word, or who searches the canonical title and gets nothing. Then the heading edits the canonical name again and the display is shown beside it.
**Owner**: the owner (2026-09-19 instruction to decide and build); applied by Claude.
