---
id: e4dde4cf-2214-4cdd-8acd-3251a7ec4e8a
date: 2026-11-17
---
## 2026-11-17 — Planning copies picked files into its home folder
**Why**: Planning documents and design images often sit elsewhere on the Mac; the owner asked that files added from outside go into the planning folder by themselves.
**Prior**: docs/records/decisions/2026-11-17-planning-home-folder-383be28a-b1a4-4278-acc1-00e26e6a29f0.md stands.
**Decision**: Add files (home folder only) copies picked files flat into `planning/`. App: `import_source_files` gains a `destination` enum, `sources` (default, unchanged) or `planning`; other values fail parsing. For `planning` it spends every offer first, copies only offered paths, applies the home scan's type rule natively to the file it copies (`unsupported-type`), and refuses a linked `planning`. Web: the picked bytes go through the folder handle; a failed copy is removed. A taken name gains ` (2)`; bytes already in `planning/` are skipped. Name check and write are two steps on both surfaces, so a file another writer creates under that name meanwhile is replaced. A copy is verbatim: Markdown with `kind:` becomes a concept, and a copied concept file duplicates its `uid`. Kept limits: no size bound (over 16 MiB copies but cannot open; the web reads each pick whole), app names fold case only (APFS folds composition), a `planning` swapped for a link after the check can be hashed but not written.
**Dissent**: A copy can drift from its original; it keeps the opened folder self-contained in Git.
**Falsifier**: Revisit if a copy lands outside `planning/`, overwrites a file in practice, copies an unpicked path, or an unlisted type is copied.
**Owner**: The project owner asked for it; delegated, with the lead reviewing before merge.
