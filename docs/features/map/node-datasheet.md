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
- **Domain / capability / element node click** → `OntologyMapDetailPanel`, the 352px datasheet (scaled up from 288px, 2026-07-18): single engraved metric line ("N items used · N items needed · N evidence docs"), typed groups for **Sub-items**, **Super-items**, **Items Used**, **Items Needed** and **Related**, each capped with a "+N more" overflow; a promoted **Evidence Docs** group listing `evidenceIds` rows; an **Copy Item Info to Send to AI** action with MCP/CLI-style context; **View Details** opens the full detail panel. For a domain, both the panel and full detail lead used-by and needs with every other domain the map's flows draw, uncapped, each with its link count, read once from the map's own graph; the domain's own directional links follow as a second line, an empty group folds into one line, and the handoff carries the same partners as `used_by_domains` and `needs_domains`. A `relates` link names no direction (spec §5), so on both surfaces and in the handoff it is **Related**, never used or needed. A number beside a full-detail row counts children only in the contains card; beside a partner domain it counts links. Relation role stays explicit so the same edge is not counted twice.
