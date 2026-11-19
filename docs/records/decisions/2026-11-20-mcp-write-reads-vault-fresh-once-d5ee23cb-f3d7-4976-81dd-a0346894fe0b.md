---
id: d5ee23cb-f3d7-4976-81dd-a0346894fe0b
date: 2026-11-20
---
## 2026-11-20 — A write reads the vault fresh once per call

**Why**: one `patch_concept` at 50,000 files read every file three times, because each of its vault loads (the UID collision check, then the post-write recompile and maintenance plan) was a fresh pass; the patch took 4.9–8.9 s on flow a. The `decisions:check` trigger is a false positive for the public contract: `mcp/src/index.js` now wraps write tools in a scope as it already wrapped read tools; no tool, argument, response, read-only or consent filter changes.
**Prior**: Amends 2026-11-19 "The MCP server reads only the vault files that changed", which had every vault load a write makes read each file and compare bytes.
**Decision**: within one write call, the first vault load reads every file and compares hashes, trusting no stamp; the call's later loads are stamp passes. Every decision a write takes from other files still comes from bytes read during the call, and the call's own writes replace their files, moving the inode, so later loads see them.
**Dissent**: an edit that keeps size, mtime, ctime and inode (a FAT or exFAT same-size edit with its mtime restored) made after the call's first load and before a later decision in the same call is not seen by that decision. The window is the call's own duration, one to a few seconds at 50,000 files; reading fresh on every load closes it at three times the reads.
**Falsifier**: a delete, rename, merge or UID check decides from a file's bytes that were already stale when the call began, or a later load in a write misses that call's own write.
**Owner**: Stark
