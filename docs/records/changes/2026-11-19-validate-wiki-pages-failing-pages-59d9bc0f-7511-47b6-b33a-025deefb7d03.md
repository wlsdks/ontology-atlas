---
id: 59d9bc0f-7511-47b6-b33a-025deefb7d03
date: 2026-11-19
category: Changed
---
`validate_wiki` with no `paths` now answers a large wiki in pages an agent can read: failing pages only, those with a blocking problem first, at most 20 problems per page with the rest counted, each reply under 128 KiB by default, and a `nextCall` that resumes after the last page shown, so repairing pages between calls skips none. The whole-folder counts and a per-code summary come on every reply. On a 50,000-file wiki the reply went from 228 MB to about 125 KiB. Naming pages with `paths` still lists each one, and `ontology-atlas wiki-validate --json` still prints every page. Repeated unclosed `[[` and `[[src:` openings no longer slow a page check down quadratically.
