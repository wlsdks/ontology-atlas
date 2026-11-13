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
  one next action. Measurement time, source kind and currentness are available under **Check record**; a stale remeasurement diagnosis is not repeated in a second explanation. The kind is a quiet header label rather than a framed badge. The receipt is not a numeric confidence score or a claim that the whole
  repository is correct. In the installed app, **Connect code folder** binds one
  Git worktree or ordinary folder and measures declared capability/element code
  paths. The receipt labels the detected source honestly as **Git repository** or
  **Local folder**; it does not imply a GitHub account or remote integration.
  **Measure again** reuses that saved binding rather than asking for a new
  folder. Cancelling the picker or failing to inspect/save preserves the previous
  binding and receipt. The web can read the saved category but cannot bind or
  remeasure a private local folder.
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
- **Domain / capability / element node click** → `OntologyMapDetailPanel`, the 352px datasheet. Its relations are two reach groups in the map's order, **Needs N** then **Needed by N**, each heading drawn with the map's line sample in the map's ink (none for an element, whose own lines the map does not draw). Members and numbers are exactly what the map's count line counts (`readConceptReach`: `capabilityLines` over `directCapabilityRelations`, `domainPartners` for a domain), so a document never appears and a `relates` or `is_a` link is never a direction. A row is one line: kind glyph, name, and a right slot with a partner domain's link count or **No reason** when the relation records none. Rows are ordered by how many concepts need the far concept (a domain's partners by link count); six or fewer show whole, more show five and **Show N more**, which opens in place. A zero group keeps its heading only beside a non-zero one; with neither, the panel says no relations are recorded. Below the groups sit at most two folded lines: **Other links N** (relates and broader, each row keeping the map's dotted or double sample) and what the concept contains (**Implementation elements N**, a domain's capability and element counts, a project's **Domains N**). A document lists the concepts it **Describes**. Evidence documents and code locations are full detail's. Pointing at a row for 150 ms, or focusing it, shows its recorded reason in the edge hover card beside the panel; the row's accessible description carries the same sentence, and Escape hides the card before it closes the panel. Tab enters the list once; the arrow keys, Home and End move across both groups. **Copy Item Info to Send to AI** keeps the typed counts and a domain's partners as `used_by_domains` and `needs_domains`; **View Details** opens the full detail panel.
