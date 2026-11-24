---
title: Topology hub
doc_type: index
status: current
area: map
---

# Topology hub

### `/` (with a loaded vault) and `/topology` — canvas-2D topology hub

`/topology` renders `HomePage`; `/` renders it after a vault is loaded (`/` = home/back-link target, `/topology` = explicit deep-link namespace). Without a vault, `/` follows the gateway/desktop first-run branches above.

The Flat overview uses readable domain branches for small maps and a packed dial for dense maps: [`flat-dial.md`](flat-dial.md).
Relation light on focus and path: [`light.md`](light.md).

### How much of the code is on the map, and since when

From `md` up, the map's top row carries one chip for a folder with a project:
the share of the code's abilities on the map, which analysis counted it and
how long ago ("62% on the map · Analysis 3 · 4 days ago"). The share is the
project note's `Not mapped yet` line; the analyses come from
`.ontology-atlas/map-analysis.jsonl`, which the MCP server appends after each
concept write (`mcp/README.md`, "The map analysis record"). Nothing else is
measured: there is no completeness score.

Pressing the chip opens a short panel under it and keeps the chip pressed; a
second press, Escape or a press outside closes it. The panel gives the share
in counts, when it was counted, the five newest analyses with the share before
and after each, and the next step: **Map the rest of the code** in the app, or
on the web a line naming where that works. Without a record the chip says no
analysis was recorded and the panel says where the record comes from; a record
that cannot be read says so and keeps the note's share. A line under ten
minutes old, or a press that is mapping, reads as analyzing now. The app reads
the file's last 1 MiB, never writes it, and rereads it on the folder watch.

### Optional continued analysis

A selected concept's **More** menu and a routed concept set offer the code
check. Nothing is offered without a selection, so the map's corner carries no
standing analysis entry. Opening the map does not scan source or start a model
call.

In the installed app, open the inspector, confirm the bound code folder and
choose **Inspect**. Source-folder recovery grants local read access without
granting vault writes to that folder. Inspection shows up to three reasons to
investigate: static imports, source changes or authored uncertainty. Counts and
omissions describe this bounded inspection, not ontology completeness.

**Analyze next** sends one displayed question once to the chosen guarded ACP
runtime after a live evidence/session check. The evidence goes to that agent's
provider and may incur cost. The request asks for investigation without edits;
it is not an enforced read-only sandbox. Captured-packet limits do not cap later
agent reads or spending. Ordinary permission checkpoints and Stop remain.

Saved results belong to their exact project, selected UIDs, question, turn and
evidence basis. A previous date is historical until explicit inspection compares
current evidence. Other questions and records missing provenance get no matching
result credit. History lookup reads at most 30 recent records and exposes a
limited/unreadable-history notice. A saved answer or agent-reported completed
plan does not accept meaning or resolve a gap.

**Prepare improvement** opens a separate editable request without sending it.
It retains the inspected code folder and quotes the prior answer as untrusted
evidence. Sending, write permission and meaning review remain separate actions;
after a change, inspect again to discover what remains. There is no global
completion percentage, automatic paid analysis or automatic write approval.
The browser explains the native inspection boundary. Native local-model source
construction remains unavailable.
