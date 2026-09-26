---
title: Agent work visibility
doc_type: feature
status: current
area: map
routes: [/topology]
---

# Agent work visibility

#### Agent work visibility

- The status line in the map utility lane does not expose raw transport names directly.
  Audit `codex-mcp-client`/`codex-acp` are preserved in logs and displayed as `Codex` on screen,
  Claude/Cursor/others are shown by each product/agent name.
- **Only fresh valid heartbeats are live.** Live status shows planning/editing/verifying/blocked
  as Planning/Editing/Verifying/Awaiting Approval. Only successful write logs being recent
  means `Change Detected`, work closed means `Last Work`, so quiet logs are not guessed as current execution.
- Clicking the status line first shows actor, phase, request summary, actual target, next step, last tool,
  and places work-unit notification records below. Notifications aggregate by task and structure changes as before, not drawing raw tool-call streams. The anchored surface
  is positioned `--chrome-tile-size + 8px` away from the right map tool column, so tool icons behind the translucent surface do not mix with the work row.
- **The status is a segment of the bell's control, in the toolbar row (2026-09-24).** It no
  longer hangs under the row: the dot, the agent and step, and the elapsed time sit left of
  the bell inside one outline. Where the lane is compact (a docked panel beside it, a focus)
  or narrower than `xl`, it folds to the dot and the elapsed time, and its accessible name
  keeps the whole sentence. While the conversation panel is open, an in-app turn's status
  leaves the toolbar, because the panel is already streaming it; another agent's heartbeat
  or a recent write still shows. The node it names moved into the status view it opens.
- **Toasts stand at the bottom of the free lane (2026-09-24).** The toaster is centred
  between the innermost walls a screen declares with `data-toast-wall` — the nav rail, the
  map's INDEX stack, the map's docked panel — 16px above the floor (the bottom tab bar's
  top below `lg`, or the map's corner readout and first-visit hint when they stand), and
  each box hugs its sentence up to `--dialog-w-md`. One neutral box
  (`--color-elevated`, `--radius-card`, `--shadow-elevation-1`) serves four tones —
  neutral, success, warning, error — told apart by a small glyph in the tone's ink, never a
  coloured fill. The Library keeps its pane-corner claim. An outcome the pressed control
  already shows is not repeated in a toast (2026-09-26): saving, replacing or removing a
  model key and choosing or dropping a local runner change their row in Agents → Models,
  and copying a project's link changes its button; each is read out by a polite live region
  instead. On those tall pages the toast had stood over the page's own text.
- Target links visibly state `Current Target:`/`Last Change:`
  and directly update node selection for `HomePage` on the map already. Route remount
  does not temporarily switch current vault to sample graph; independent consumers only
  use `/topology?mode=focus&p=…` fallback. Heartbeat/tool input reveals current vault's
  actual slug only then drawing the existing amber agent-focus ring.
- Changed agent phase and target labels crossfade in place while their controls retain focus.
  Elapsed time updates separately without replaying the transition. The current-work body
  scrolls within its viewport cap. Map inspectors use the large-surface fade, keeping the
  reading surface stationary while the camera approaches the selected concept.
- App ontology write allow/deny and final state remain in the vault as limited work receipts in
  `.ontology-atlas/acp-work.jsonl`. Full conversation/thought/
  tool output/absolute paths are not saved. Recent receipts can be viewed collapsed in the activity popover,
  allowing re-check of request/agent/tool/decision/result/typed change items.
- `created_by` is queryable provenance data but not review status. Thus
  there is no human authorship INDEX lens or red review ring. `vault-readme` is read as Docs reader guide
  but excluded from topology adapter, INDEX, canonical concept census, editor target.
