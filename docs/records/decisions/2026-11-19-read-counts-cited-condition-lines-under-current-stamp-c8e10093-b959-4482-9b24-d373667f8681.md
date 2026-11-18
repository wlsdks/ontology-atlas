---
id: c8e10093-b959-4482-9b24-d373667f8681
date: 2026-11-19
---
## 2026-11-19 — A read counts when its cited condition lines were served under the file's current stamp

**Why**: Review of #3563: `evidence: answered` passed with zero reads or with line 1 of each file; reads under `rootPath=<repo>/pkg` did not count at the root; the record outlived file edits.
**Prior**: Narrows `6ae3d739`: the served-read record stands; what counts as a read, and how the record is keyed, change.
**Decision**: A capability counts as read when its body cites lines that this server served and that hold a condition. Zero reads with a connected repository is judged, not skipped, so `evidence: answered` is refused. The record keys each file by its real absolute path, so any `rootPath` inside the repository counts for it. A size or mtime change drops the file's ranges. MCP over stdio carries no session id; one process serves one client connection, so the process is the session, and a restarted server keeps no reads and says so.
**Dissent**: a builder who reads correctly but cites prose instead of lines is refused; two clients that share one process would share the record; a same-size edit inside one mtime tick keeps a stale read.
**Falsifier**: a finalize with `evidence: answered` passes while a capability's cited condition lines were never served in that process, or were served before an edit to that file.
**Owner**: Stark
