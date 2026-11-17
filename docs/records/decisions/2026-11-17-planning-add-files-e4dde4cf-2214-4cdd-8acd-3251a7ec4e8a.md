---
id: e4dde4cf-2214-4cdd-8acd-3251a7ec4e8a
date: 2026-11-17
---
## 2026-11-17 — Planning copies picked files into its home folder
**Why**: Planning documents and design images often sit elsewhere on the Mac, and the owner asked that files added from outside go into the planning folder by themselves.
**Prior**: docs/records/decisions/2026-11-17-planning-home-folder-383be28a-b1a4-4278-acc1-00e26e6a29f0.md stands; this adds the first copy into `planning/` from outside the opened folder.
**Decision**: Add files, home folder only, copies files the person picked flat into `planning/`. In the app the native picker records each path it offers and `import_source_files` copies only offered paths; its new `destination` argument is a fixed enum, `sources` (default, unchanged) or `planning`, and any other value is refused before the command runs. `planning` keeps the command's confinement and refuses a linked `planning` entry. On the web the file picker's bytes are written through the opened folder's handle, Markdown writes marked as the person's own. Only the types the home scan lists are copied, by its own name rule, checked by the page before the native call. Nothing is overwritten: a taken name, ignoring case (and on the web Unicode composition), gains ` (2)`, ` (3)`, …; bytes already in `planning/` are not copied again.
**Dissent**: A copy can drift from its original where a link would not; a copy keeps the opened folder self-contained in Git.
**Falsifier**: Revisit if a copy lands outside `planning/`, overwrites a file, copies an unpicked path, or an unlisted type is copied.
**Owner**: The project owner asked for it; the implementation was delegated, with the lead reviewing before merge.
