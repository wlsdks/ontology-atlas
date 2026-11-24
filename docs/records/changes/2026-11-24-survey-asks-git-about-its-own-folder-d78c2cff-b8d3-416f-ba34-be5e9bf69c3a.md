---
id: d78c2cff-b8d3-416f-ba34-be5e9bf69c3a
date: 2026-11-24
category: Fixed
---
The repository survey asks Git only about the folder it surveys: run from inside a Git hook, it no longer reads another repository's index, and a repository's own settings can no longer hide files from it. A survey also walks the code once instead of twice.
