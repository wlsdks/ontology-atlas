---
id: f19d498e-25f6-447d-bb65-ff84965ff71c
date: 2026-09-27
kind: mistake
status: reported
harness_area: fs-walks
---
**Observed**: #2055's first commit guarded `sources/` in `slugToPath` (`mcp/src/vault.mjs` and its CLI twin `cli/src/lib/write-vault.mjs`) by comparing the slug's first segment through `toLowerCase()`, plus a readdir check of the disk's spelling. The security review reproduced a bypass, 4 of 4 on APFS: `'ſ'.toLowerCase()` stays `ſ` while APFS opens `ſources/` as `sources/`, and an in-vault link `inbox -> sources` carries an unrelated name. Through them, `get_concept`, `patch_concept`, `add_concept` and `atlas add --raw-slug` read and rewrote a raw source and created three files inside `sources/`. The same spelling-based open in `rawSourceKindIssues` (`mcp/src/validate.mjs`) flagged a real `Sources/` node folder and followed a `sources` link out of the vault. Unlike 79adce85 and 76760f52 (visited sets in walks), this is path identity: which folder a name opens.
**Cost**: one security review round, a second fix commit on #2055, and two added tests per surface.
**Suspected cause**: the guard judged what the slug says, not what the filesystem opens. Unicode case folding and links make those differ, and `realpathSync` keeps the caller's spelling; only `realpathSync.native` returns the disk's (measured: `Sources` and `ſources` both came back as `sources`).
**Proposed change**: rule. A guard for a named vault folder resolves the nearest existing ancestor with `realpathSync.native` and compares the first real segment exactly; a listing descends only into a Dirent named exactly that is `isDirectory()`; and the guard's tests include a `ſ` spelling and an in-vault link.
