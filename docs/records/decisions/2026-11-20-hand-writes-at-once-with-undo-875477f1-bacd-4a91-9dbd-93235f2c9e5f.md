---
id: 875477f1-bacd-4a91-9dbd-93235f2c9e5f
date: 2026-11-20
---
## 2026-11-20 — A person's own write on the map happens at once and can be undone

**Why**: An inventory of building by hand found 13 entry points across three places, a blocking create dialog with an unexplained kind select, a review step before every one of a person's own creates and relation edits, one select over every concept to pick a relation's target, no rename or delete on the map, and no undo after any write. The owner asked for building by hand to be easy to use and good to look at.
**Prior**: Overturns one clause of 2026-08-21 (92), "every create/edit builds an `OntologyChangeSet` confirmed against an accurate before/after before the writer executes", for writes a person makes by hand. Its other half stands unchanged: an agent's write waits for `allow_once` on a change card. `docs/records/decisions/2026-11-16-acp-auto-approve-standing-scope-15443720-35ad-47da-8f03-6ec2ae4a36be.md` stands.
**Decision**: Creating, relating, renaming, describing and deleting a concept happen in place on the map with no blocking dialog and no review step. Each write lands at once and answers with a toast and Undo for the most recent write, which restores the file's bytes and refuses in one sentence when the file changed on disk since. Deleting asks once, in place, and names the documents that still point at the concept. A relation's target is found by search, and a hand write produces the frontmatter the MCP writer produces for the same relation.
**Dissent**: A review before the write shows the exact Markdown and catches a slip before it reaches the folder, and Undo covers only the most recent write; that was the measurement behind (92).
**Falsifier**: a hand write that Undo cannot restore byte for byte, a person reporting a write they did not mean and could not take back, or a hand-written relation whose frontmatter differs from the MCP writer's.
**Owner**: Stark
