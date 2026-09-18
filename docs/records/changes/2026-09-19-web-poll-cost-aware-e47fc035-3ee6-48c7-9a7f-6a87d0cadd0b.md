---
id: e47fc035-3ee6-48c7-9a7f-6a87d0cadd0b
date: 2026-09-19
category: Changed
---
On the web, the folder reread that keeps the Library and the map current now waits at least twenty times its own cost between polls (capped at a minute): a 12,000-file folder reread costs about 230 ms, so it still polls every 5 s, and no folder can make the poll take more than a twentieth of the time.
