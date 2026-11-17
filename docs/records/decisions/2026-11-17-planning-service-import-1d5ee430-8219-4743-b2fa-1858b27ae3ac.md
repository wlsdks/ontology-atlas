---
id: 1d5ee430-8219-4743-b2fa-1858b27ae3ac
date: 2026-11-17
---
## 2026-11-17 — A service import may land in the planning folder
**Why**: The owner asked that planning documents kept in Notion and similar services reach Planning without copying files by hand. The Library's service import writes only under `sources/`, which Planning does not read.
**Prior**: Extends the service import under 2026-09-05 "A person attaches external MCP servers…" (docs/DECISIONS.md); connector setup, list-then-ask, the item bound and the permission card on every write are unchanged. Builds on docs/records/decisions/2026-11-17-planning-home-folder-383be28a-b1a4-4278-acc1-00e26e6a29f0.md.
**Decision**: The import takes a destination from a fixed set of two, `sources` (default) and `planning`; a caller never sends a path. Planning's home folder opens the Library's dialog with `planning`, and the brief names `planning/<service>/` as the only folder the agent may write into. Atlas writes nothing itself. Markdown under `planning/` is parsed like any Markdown in the folder, so the brief asks for `source_url` and `fetched_at` as the only frontmatter keys, keeping an imported page from arriving with a `kind:`. Confluence and Jira stay out: the in-app session cannot sign in to their hosted address.
**Dissent**: A brief is a request, not enforcement: an agent can still propose a write elsewhere or another frontmatter key, and only the person reading the permission card stops it.
**Falsifier**: Revisit if an imported document appears as a map concept, an import turn writes outside the folder its dialog named, or people look for a Planning import under `sources/`.
**Owner**: The project owner asked for it; the lead built it, with one independent review before merge.
