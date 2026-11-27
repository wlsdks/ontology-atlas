---
id: e957fb3a-18c3-4693-86ab-937032270231
date: 2026-11-27
---
## 2026-11-27 — Evidence staleness ignores comment and whitespace edits

**Why**: on this repository's vault the date rule marked 72 of 90 file-citing concepts stale; for 10 of them the cited file changed only in comments since the concept was written (for example a comment renaming `add_concept` to `add_concepts`), which is the falsifier of `docs/records/decisions/2026-09-19-drift-line-names-its-evidence-3030afde-cf44-4d45-887e-92ec3dfb3903.md`. Git's whitespace filter alone catches none of them.
**Prior**: narrows 2026-09-19 "A drift line names the file and the two dates it compared": its date comparison stays as the first test; its falsifier is observed and answered with a content test.
**Decision**: a (concept, file) pair the date rule calls moved is re-read at the document's newest commit and in the working tree; when both are equal after removing comments (only for extensions with known comment syntax, string literals kept) and all whitespace, the pair is not moved. Any read failure, binary file, file over 1 MiB or uncommitted document keeps it moved. One normalizer serves the map and the MCP server. Spec: `docs/specs/2026-11-27-evidence-ignores-comment-edits.md`.
**Dissent**: ignoring function-body edits too, as floorplan does, would remove 46 more stale concepts; rejected because Atlas concepts describe rules that live inside function bodies, so that would hide real drift.
**Falsifier**: a concept whose cited file changed meaning only inside a comment-like construct the normalizer misreads (a string, regex or template that contains comment syntax) is shown current; or the stale share stays above half after construction writes line-range citations.
**Owner**: jinan
