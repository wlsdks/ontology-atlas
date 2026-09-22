---
id: bd98ff72-6ec2-4338-8373-0a1b1d03fcc2
date: 2026-09-23
---
## 2026-09-23 — A dependency witness is an import, not a word

**Why**: the 2026-09-22 falsifier fired on this vault: a frame loop that never imports the camera module cleared its edge because "camera" sat inside unrelated hook names; two more edges were green on the word "layout". A third unknown repository (a Rust CLI, 18 nodes, 2 turns, $6.69) validated clean yet carried two such edges, the witness one file away.
**Prior**: 2026-09-22 "A replay on two unknown repositories names the next four gaps" standing; its dissent (a basename mention is a weak witness) is now the rule. 2026-08-31 Rust receipts standing.
**Decision**: `dependency-unwitnessed` reads module specifiers from the whole file (JS/TS `from`, `import()`, `require`; Python; Rust `use`/`mod` across lines and braces; Go import blocks; C `#include`) and matches the target's module name as a path segment; `mod.rs`, `index.*` and `__init__.py` answer to their folder; a bare word elsewhere is not a witness; `:3-9` and `#L3-L9` note paths resolve. The dogfood vault's seven exposed edges were repaired through the product (six re-witnessed with file:line, one demoted to `relates`). The compiled binary is re-signed ad hoc after `bun build`; macOS 27 kills bun's signature at launch.
**Dissent**: a contract test that imports both sides is accepted as the witness of a runtime wiring (in-app agent → MCP server); that proves the inventory agrees, not that the session spawns it. Dynamic dispatch by template string is invisible and lives only in the `why`.
**Falsifier**: the Rust reader answered 5 of 6 with exact paths and refused q4 honestly; the miss (failure action at `src/options.rs:421`) sat in a file the builder cited without outlining. If the next unknown repository misses a behaviour in a cited file again, the card tells the builder to outline every file it names as `path:` before writing its Uncertainty line; if a witnessed edge is again a name with no call behind it, the check reads call sites.
**Owner**: Stark
