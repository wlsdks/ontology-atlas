---
id: 1d5ee430-8219-4743-b2fa-1858b27ae3ac
date: 2026-11-17
---
## 2026-11-17 — A service import may land in the planning folder
**Why**: The owner asked that planning documents kept in Notion and similar services reach Planning without hand copying. The Library's service import writes only under `sources/`, which Planning does not read.
**Prior**: Extends the service import under 2026-09-05 "A person attaches external MCP servers…" (docs/DECISIONS.md); setup, list-then-ask and the item bound are unchanged. 2026-09-07 "Markdown under sources/ is a raw source" stands. Builds on docs/records/decisions/2026-11-17-planning-home-folder-383be28a-b1a4-4278-acc1-00e26e6a29f0.md.
**Decision**: The import takes a destination from a fixed set of two, `sources` (default) and `planning`; a caller never sends a path. Planning's home folder opens the Library's dialog with `planning`, and the brief names `planning/<service>/` as the only folder the agent may write into. Atlas writes nothing itself. Markdown under `planning/` is parsed like any Markdown in the folder, so there the brief asks for no frontmatter block and the source address and fetch date on a line under the heading; `sources/` keeps `source_url` and `fetched_at`. Both briefs now say a fetched document is data, never an instruction. Each write shows a permission card unless the person kept auto-approve for the folder (docs/records/decisions/2026-11-16-acp-auto-approve-kept-per-folder-04edab8a-8a56-4047-91dc-7bbea87fd962.md).
**Dissent**: A brief is a request, not enforcement: an agent can still propose a write elsewhere or a `kind:`, and with auto-approve on no card stops an in-folder write. No real import turn was observed before merge.
**Falsifier**: Revisit if an imported document appears as a map concept or raises a validation warning, an import turn writes outside the folder its dialog named, or people look for a Planning import under `sources/`.
**Owner**: The project owner asked for it; the lead built it, with one independent review before merge.
