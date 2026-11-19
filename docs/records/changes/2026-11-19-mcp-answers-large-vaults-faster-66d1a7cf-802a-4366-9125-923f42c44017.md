---
id: 66d1a7cf-802a-4366-9125-923f42c44017
date: 2026-11-19
category: Changed
---
On a vault of 50,000 files the MCP server now answers a repeated question such as get_concept, find_backlinks or find_path in about a quarter of a second instead of two to four seconds, with about half the memory, because it reads again only the files that changed. Reading a repository's Markdown no longer stalls for seconds on a page full of broken links or unmatched emphasis.
