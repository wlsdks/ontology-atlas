---
id: 2d359c0a-7518-467f-bbb4-1a1cc71c8bc9
date: 2026-11-19
---
## 2026-11-19 — The MCP server reads only the vault files that changed

**Why**: at 50,000 files every MCP call re-read, re-parsed and hashed the whole vault: a second `find_path` cost 3.6 s CPU and resident memory reached 2.0–2.2 GB in the compiled server. The `decisions:check` trigger here is a false positive for the public contract: `mcp/src/index.js` only wraps read tools in a shared snapshot; no tool, argument, response or instruction changes.
**Prior**: Keeps 2026-09-12 "The MCP entry point is wiring; workflows live in their own modules": the entry point gains one dispatch line. Follows the state-architecture verdict's per-row stamp and racy-stamp rules (2 s, bytes compared again).
**Decision**: the server keeps one parsed copy per file, keyed by path, device, inode, size, mtime and ctime, and re-reads a file only when its stamp moves or falls within 2 s of its read. The compiled artifact is keyed by the stamp-set version. A read tool call shares one stamp pass. Writes still read their target from disk and check `expected_mtime` and the expected bytes. A write's fresh read whose bytes differ from the kept copy drops that copy and moves the version.
**Dissent**: a stamp stays equal across a content change outside the racy window when a tool restores size, mtime, ctime and inode together, and on FAT-family volumes, which keep no ctime, whenever a same-size edit's mtime is restored. The server then serves the old parse until a write reads that file and discards it. A watcher or a hash of every file per call would catch the edit at once, at the cost this record removes.
**Falsifier**: an edit made between two calls is not seen on the second, or a write overwrites a disk file newer than the doc it was planned from.
**Owner**: Stark
