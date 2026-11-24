---
title: Node datasheet
doc_type: feature
status: current
area: map
routes: [/topology]
---

# Node datasheet

#### Node datasheet — two variants by node kind
- **Project node click** → the same right-side datasheet shell, with a project-only
  **code-evidence receipt** in place of the generic stats row. The receipt reports
  a categorical state, measurement time, currentness, the first evidence gap, and
  one next action. Measurement time, source kind and currentness follow on one quiet line; a stale remeasurement diagnosis is not repeated in a second explanation. The kind is a quiet header label rather than a framed badge. The receipt is not a numeric confidence score or a claim that the whole
  repository is correct. In the installed app, **Connect code folder** binds one
  Git worktree or ordinary folder and measures declared capability/element code
  paths. The receipt labels the detected source honestly as **Git repository** or
  **Local folder**; it does not imply a GitHub account or remote integration.
  **Measure again** reuses that saved binding rather than asking for a new
  folder. Cancelling the picker or failing to inspect/save preserves the previous
  binding and receipt. The web can read the saved category but cannot bind or
  remeasure a private local folder.
- **No code locations recorded** → when a measured project has no document that
  names a `path`, the receipt says that no capability or element names its code
  file and offers one step. With an in-app agent tool ready the step is **Ask the
  agent**: it closes the full detail if open and seats a request in the map's
  chat (find each concept's file, record it in `path`, list the ones it cannot
  place); sending stays the person's act. Without a ready tool, in the app or on
  the web, the step is **Copy the request**, which copies the same text for the
  agent the person already uses.
- **Receipt privacy/currentness** → the private absolute folder path lives only in
  the vault-local `.ontology-atlas/project-sources.json` sidecar, never in graph
  Markdown, copied handoff text, or MCP output. A new sidecar write also creates
  `.ontology-atlas/.gitignore` when it is absent (an existing ignore file is left
  untouched). The installed app may show `current` only after it re-inspects the
  bound folder and matches its source identity, revision, and fingerprint to the
  receipt. If that recheck cannot run, the saved receipt remains visible but
  currentness is `unavailable`; an observed source or ontology change is `stale`.
  The recheck walks the folder only when a saved receipt's currentness is still
  open; with no binding, no receipt, or a receipt the ontology already outdated
  the answer is final without it (2026-09-25 — every open used to walk the whole
  repository and discard the result).
- **While the receipt is read** → the datasheet is already the project's: the
  concept-document meta line, the folded relations below `1513px`, the quiet
  footer. The code-evidence heading and its status line hold the receipt's place,
  the line saying it is reading only once the read outlives 150 ms, so the answer
  changes words rather than layout; the gap line and the remedy then open through
  the row disclosure (2026-09-25 — the panel used to open in another layout and
  rebuild itself 710 ms later, every button pushed down in one frame).
- **Domain / capability / element node click** → `OntologyMapDetailPanel`, the 352px datasheet. Its relations are two reach groups in the map's order, **Depends on N** then **Used by N**, each heading drawn with the map's line sample in the map's ink. Members and numbers are exactly what the map's lines and count line show (`readConceptReach`: `conceptLines` over `directRelations`, `domainPartners` for a domain), so a document never appears and a `relates` or `is_a` link is never a direction. A row is one line: kind glyph, name, and a right slot with a partner domain's link count or **No reason** when the relation records none. Rows are ordered by how many concepts need the far concept (a domain's partners by link count); six or fewer show whole, more show five and **Show N more**, which opens in place. A zero group keeps its heading only beside a non-zero one; with neither, the panel says no relations are recorded. Below the groups one quiet line counts the rest, for example **Other relations 2 · Implementation elements 1** (a domain counts its capabilities and elements, a project its **Domains N**); it never unfolds, and where the panel has a full-detail step it opens full detail, which lists those rows. A document lists the concepts it **Describes**. Evidence documents and code locations are full detail's. In the app, a concept whose document names code (`path:`, or a cite such as `src/billing/invoice.ts:L40-L52`) has one **Code** row under its definition with the file and how many ranges it cites; pressing it opens the code reader (`src/widgets/code-reader/`, `docs/specs/2026-11-24-read-code-in-place.md`) left of the panel while the map keeps 480 px, or in the panel's place with **Back** when it would not. The reader reads a bounded window of that file through the vault's one connected code folder (`src-tauri/src/code_reader/`), marks the cited range as a band in view in its first frame, offers one chip per cited range and **From the top**, and says whether the document cites these lines, the file changed after the document was written (modified time, five seconds of slack), the range runs past the end, or no lines are cited. A refused read (a secret name, `.git/`, an unlisted dot folder, a path or link out of the folder, over 2 MiB, not text, gone, no folder connected, the folder moved) shows its sentence and no text. When the window regains focus the reader compares the file's time and size and offers **Read again** if it changed; it reads nothing at rest. The Code row stays selected while the reader is open and closes it on a second press. On the web the row is not drawn; full detail lists the path with Copy and a card that says why and links to the app. Pointing at a row for 150 ms, or focusing it, shows its recorded reason in the edge hover card beside the panel; the row's accessible description carries the same sentence, and Escape hides the card before it closes the panel. Tab enters the list once; the arrow keys, Home and End move across both groups. **Copy Item Info to Send to AI** keeps the typed counts and a domain's partners as `used_by_domains` and `needs_domains`; **View Details** opens full detail, a centred dialog over the dimmed map: kind and owner, title, slug and last change in a fixed header, then the body, relations, reach, agent prompt, code locations and project source in one scrolling column; closing returns to the same selection and panel.
