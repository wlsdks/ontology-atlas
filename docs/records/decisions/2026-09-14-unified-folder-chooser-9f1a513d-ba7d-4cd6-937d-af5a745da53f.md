---
id: 9f1a513d-ba7d-4cd6-937d-af5a745da53f
date: 2026-09-14
---
## 2026-09-14 — Returning folder selection is one list and one page scroll

**Why**: The owner inspected the installed app and rejected a narrow, independently scrolling recent-folder list above three large creation/open cards. The fifth folder was cut off while unrelated actions occupied a second block below it.
**Prior**: Keeps 2026-09-13's folder-count launch decision (6837cdab-43bc-49e9-90ec-766ddc3d2aac): one known folder resumes, multiple folders ask, and rows preserve identity, currentness and recovery. Replaces its bounded-list presentation on the root chooser; the compact rail switcher retains its own containment.
**Decision**: The owner selected the integrated list direction over the status quo and a left-tools/right-list split. The returning root chooser uses a wide list, compact Open folder and Create new actions above it, and page-owned scrolling. Creation locations remain explicit in a disclosure and reuse the existing shape question and local creation flows. Page-list names wrap to preserve distinguishing suffixes. No new vault schema, permission, persistence or automatic selection behavior is introduced.
**Dissent**: Keeping the three creation paths permanently visible avoids a disclosure click. Rejected here because they displaced the returning person's folder choice. Independent reviewers also rejected identical truncated names at narrow widths; page-mode wrapping preserves the distinction without changing the compact switcher.
**Falsifier**: A chooser row needs nested scrolling, distinct folder names lose their distinguishing suffixes, a creation choice writes before the existing flow authorizes it, or keyboard cancellation cannot recover the folder list and creation trigger.
**Owner**: jinan
