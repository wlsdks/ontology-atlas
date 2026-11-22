---
id: 3b55c4d4-d187-47cd-bf3e-082e8d4edd40
date: 2026-11-22
---
## 2026-11-22 — Harness reads agent settings from every scope, keeps versions of their hooks and changes hooks in the files it names

**Why**: The owner, 2026-11-22: agent settings and hooks of every scope should be easy to find and set inside Atlas, explained in a popup, with versions he can save after a deleted hook was lost. That day his User files held 25 hook entries Harness did not read.
**Prior**: Extends `e35a25fe` with fixed files outside the repository, the fourth exception in `.claude/rules/surfaces.md`; extends Record 3 of `docs/specs/2026-11-22-work-status-criteria.md` from Atlas's own entries to hooks a person manages. Keeps `c52ae218`, `3a63ada4`, `e47518a9`, `ffd59b03` and `forbidden.md`.
**Decision**: In the app, Harness reads hook entries, two switches and permission-rule counts from the User, Local, Managed and System settings of Claude Code and Codex, by fixed name or from a file the person picked, into allow-listed structs: event names only from each tool's documented list, at most 500 hooks per file; never `env`, a helper, a header, an address, rule text, a credential file or a folder listing. Every path component opens without following a link; a picked file inside another Git work tree is refused. Later slices change one hook entry after a Review, with Undo, and keep versions per file; Atlas never writes `config.toml`, a managed file or `disableAllHooks`, and never runs or trusts a hook. The web only explains.
**Dissent**: A hook command can hold a token and Atlas shows it; reading the home folder on arrival is wider than any earlier exception; managing another product's settings moves Atlas away from a codebase ontology.
**Falsifier**: The planted string in any record, log or error; a write to a file Atlas did not name and the person did not pick; a written command no person typed and no template or listed file held; a person who believes from Atlas's words that a hook ran.
**Owner**: Stark
