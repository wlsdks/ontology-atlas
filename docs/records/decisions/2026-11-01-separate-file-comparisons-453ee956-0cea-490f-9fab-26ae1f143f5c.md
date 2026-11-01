---
id: 453ee956-0cea-490f-9fab-26ae1f143f5c
date: 2026-11-01
---
## 2026-11-01 — Separate file comparisons from commit and PR reading

**Why**: The owner showed the installed 53-file group followed by seven commits and could not easily inspect the work; an independent usability review confirmed that the list, comparison and messages compete in one section.
**Prior**: Reopens e33872d5-45ee-4545-ba0d-e91635ebc0b5's exclusive reading views and its full-group file navigation when filtered; retains exact source attribution and period-wide comparison. Retains 55781ce6-1508-432a-8df6-efebf7716a17's originals before generation while replacing its mixed first list with PR-first reading.
**Decision**: Separate PRs, commits and files. In file review, use a searchable file list beside one comparison on wide screens and one pane at a time on narrow screens; make group return change the visible state. Previous and next follow the current search results, and comparisons remain labelled as period endpoints.
**Dissent**: A single full-width comparison keeps more code readable and stable full-group traversal avoids changing sequence during search; the split costs width and independent scroll management.
**Falsifier**: Reopen if the installed wide or narrow journey cannot identify the selected file, search sequence or return, or if a reader mistakes a period comparison for an individual PR or commit diff.
**Owner**: User delegated direction selection to Codex in this session.
