---
id: 36eefbb2-af67-4248-a3ae-7acc6eabba35
date: 2026-11-20
category: Changed
---
On a vault of 50,000 files the MCP server now holds about 160 MB after twenty calls instead of about 350 MB, because it keeps each file's frontmatter and the facts its tools read rather than the whole text. A second patch_concept in a session takes about three seconds instead of five, since a write reads the vault fresh once instead of three times.
