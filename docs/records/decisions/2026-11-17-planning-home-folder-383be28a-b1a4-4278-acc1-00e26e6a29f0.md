---
id: 383be28a-b1a4-4278-acc1-00e26e6a29f0
date: 2026-11-17
---
## 2026-11-17 — Planning writes in a home folder inside the open folder
**Why**: A new person has no planning folder to pick, the picked folder is forgotten on every launch, and the owner asked Atlas to make the folder inside the opened folder, as it does for the ontology, and to let people write documents there.
**Prior**: Narrows docs/records/decisions/2026-11-01-planning-folder-reader-bf766fb3-87b3-449e-ae69-5bb0ce46c1f2.md to "a folder the person picks": that folder keeps its session-only, read-only, macOS-only grant through the native picker, unchanged.
**Decision**: Planning gains a home folder, `planning/` directly inside the opened ontology folder, read and written through the existing folder grant (the app's folder handle and the browser's File System Access handle); no native command, permission or Rust change. A loaded folder with `planning/` opens it on arrival; without one the stage offers to create it, with picking another folder as the second, app-only door. The home folder lists the same file types and skips the same entries as the picked-folder scan, identifies a document by the first 32 hex characters of its SHA-256, creates Markdown with a heading only, and saves only while the bytes on disk still match the identity the editor opened. Its Markdown carries no `kind:`, so it is neither a concept nor a wiki page.
**Dissent**: Writing inside the ontology folder mixes planning prose with the meaning graph's files and puts both under the same Git history; a separate folder would keep them apart. The owner chose one folder people already opened over a second grant to remember.
**Falsifier**: Revisit if a planning document appears as a map concept or a wiki page, a write lands outside `planning/`, or a person cannot tell which folder Planning can write to.
**Owner**: The project owner asked for the home folder; the implementation was delegated, with the lead reviewing before merge.
