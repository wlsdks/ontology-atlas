---
id: 42050653-1cc5-4dbb-89fb-7ec6e58a3388
date: 2026-09-20
category: Changed
---
When an agent session ends, the app now writes the first few lines the agent process printed on its error stream into the app log, and says so when a session that ended within ten seconds printed nothing at all. Until now those lines existed only inside the conversation that died with them, so a press that did nothing left no trace to read.
