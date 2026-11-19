---
id: 3720fd60-454f-4612-a075-b36e9b1a80f9
date: 2026-11-19
category: Fixed
---
On Windows, the model connection in Agents › Models now sends: a connection check, a chat by key or by address, and an evidence check each write their line to the folder's `.ontology-atlas/llm-audit.jsonl` first and then go through, where before every one was refused because the log could not be written safely there.
