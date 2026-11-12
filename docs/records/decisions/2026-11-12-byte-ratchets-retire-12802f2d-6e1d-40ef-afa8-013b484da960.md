---
id: 12802f2d-6e1d-40ef-afa8-013b484da960
date: 2026-11-12
---
## 2026-11-12 — Byte and shape ratchets retire

**Why**: owner, 2026-11-12: harness that slows development goes. The comment-byte ratchet held 35 raise records, 8,860 bytes of justification for 25,655 bytes of comments; 34 commits only trimmed comments; today it refused a merge at +1 and +103 bytes. The resident-context ratchet duplicated a fixed cap; the shape ratchet pinned a shape, not a harm.
**Prior**: `pnpm decisions:find comment bytes` finds no record that introduced them; they landed with #1917 and #1971 (2026-09-26/27), overturned here. Keeps 2026-09-26 "harness follows the Opus 5.5 guidance" (small resident context); applies 2026-11-12 "Tests protect a harm, not a shape".
**Decision**: delete `source-comment-bytes`, `source-shape` and their raise records. Resident context (`AGENTS.md`, `CLAUDE.md`, always-loaded rules, Next block excluded) keeps one fixed 20,000-byte cap. The merge-base judge stays for security raw sinks, test-title language, tab roles and quaternary text. A file splits when it stops being one job; `pnpm review:facts` marks a changed file over 800 lines.
**Dissent**: without a ceiling comments and files grow by drift, and only a reviewer stops a 1,200-line file.
**Falsifier**: a reviewer asks for a comment trim or a file split more than once a week for a month; restore a reported, not blocking, census.
**Owner**: Stark
