---
id: 1e974dd6-9ab7-48b5-9a97-3ce6a00c6ca2
date: 2026-11-19
---
## 2026-11-19 — A symbol a node says was not read is a read finalize asks for

**Why**: Stage F grade (11/7/0/0 of 18 in both builds): 8 of the 14 partial answers quote the vault's own line naming the function as not read ("`Config.loadConfig` body not read", "Release.getSemverBump not read"). The answer was one read away; an `## Uncertainty` line was accepted in place of the read, and nothing returned it as work.
**Prior**: Extends `5d4e1d65` (shared roles are a floor) and `888605dd` (depth by served reads): a read counts only when this process served it. The `## Uncertainty` rule of the construction card stands: a node still names what it could not check.
**Decision**: When a body line says code was not read ("not read", "never opened", "unread", "outlined only") and names a symbol in code form or code shape that resolves to one declaration in the repository (narrowed by a path on the line, else by the node's `path:`), finalize refuses, whatever the competency rows say, until a symbol read by `{ path, symbol }` this process served covers that declaration, and then until the node drops the line or keeps one `## Uncertainty` line for that symbol alone saying why it still cannot be read after "because". A line read, a part another read served, or deleting the sentence does not count; a claim seen earlier in the session still owes its read. The coverage line after writes names the same reads.
**Dissent**: a builder may write fewer "not read" lines to avoid the reads, so the vault states less of what it skipped; a name that only looks like code can cost a read.
**Falsifier**: in the stage G builds the vaults still carry lines naming a declared symbol as not read at finalize, or the "not read" lines fall while the reads after the first write do not rise.
**Owner**: Stark
