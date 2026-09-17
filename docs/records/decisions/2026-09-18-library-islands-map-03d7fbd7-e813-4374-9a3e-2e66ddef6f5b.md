---
id: 03d7fbd7-e813-4374-9a3e-2e66ddef6f5b
date: 2026-09-18
---
## 2026-09-18 — Past four hundred marks the Library graph is a map of islands, and a press opens one

**Why**: the owner: a wiki piles up thousands of files in no time, plan for tens of thousands, and find the picture that makes a person go "wow" and is still calm. Columns name everything up to a few hundred marks; past that no picture can name things, and a wall of unnamed squares was not a picture.
**Prior**: extends 2026-09-17 "The Library graph is a flow of columns" (kept below `ISLANDS_MIN_MARKS`, and inside an opened island). Reference: the data map (Nomic Atlas, information cartography): points as texture, topic labels at rest, detail as the camera closes in.
**Decision**: `library-islands-layout.ts`: an island per concept — its pages as discs at the centre, the files they read as squares around them on a sunflower spiral; Unsorted for pages naming no concept (or one island per wiki sub-folder), Unread for files no page read; islands packed largest-first about the centre, stretched to the box's aspect; every island named on a ground plate; a stale page an amber dot; no line at rest; the quiet overview painted in four fills. A press on an island opens it as columns with a chip and Escape back; a dot takes a press only from an 8px radius. Folded pages stand in stacks, each with the files its pages read to its left.
**Dissent**: a wiki with no concepts and one flat folder is two islands, Unsorted and Unread, which is honest and dull. The folder walk still caps at 4,000 entries (`VAULT_WALK_MAX_ENTRIES`, TS and Rust); raising it is a separate decision, so a ten-thousand-file folder is not yet seen whole.
**Falsifier**: an island whose dots leave its disc or two islands overlapping; an island without a name at 1512; a press on a 2px dot opening a card instead of the island; a folder of 10,000 files drawing over 8 ms a frame at rest; the same folder mapping differently on two visits.
**Owner**: jinan
