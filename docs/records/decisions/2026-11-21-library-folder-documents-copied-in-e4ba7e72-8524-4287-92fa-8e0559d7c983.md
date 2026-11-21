---
id: e4ba7e72-8524-4287-92fa-8e0559d7c983
date: 2026-11-21
---
## 2026-11-21 — Documents already in the folder are copied in with their folders, and lead the first visit

**Why**: on the installed app, a folder holding 40 documents in five folders opened a Library that said zero sources. Discovery skips Markdown, HTML and TSV, a dropped folder is refused, and an import flattens every file into `sources/`, so the person's own folders vanish. Spec: `docs/specs/2026-11-21-library-words-and-first-run.md`, "Documents already in the folder".
**Prior**: revises the 2026-11-21 record "The Library calls a source by its everyday word, and the first visit starts with one drop area" (f8221a18) in two places. Found files lead when they are inside the open folder, and stay a quiet suggestion when they come only from a bound project root. A dropped folder is copied instead of refused. Upholds 2026-09-07 "Markdown under sources/ is a raw source": `sources/` stays the one place a source lives.
**Decision**: copies keep the folders they came from, with each relative path computed in Rust from the root it offered. Discovery offers `md`, `markdown`, `html`, `htm` and `tsv`, and offers Markdown only inside the open folder, never a file with `kind:` frontmatter, under `sources/`, `wiki/` or `.ontology-atlas/`, or named like a repository guide. Above 500 files or 500 MB a copy asks first, and it can be stopped. Skipped files are counted with their reasons. Atlas never moves or deletes an original. Tracking a changed original (F2b) writes a new vault file and gets its own record.
**Dissent**: copying notes a person keeps editing makes two versions until F2b lands, and leading with found files brings back the risk of offering junk, now limited to the open folder.
**Falsifier**: a cold reader who opens a folder of documents still cannot tell why the Library shows none or how to bring them in; or a file offered from the open folder is one the person calls junk.
**Owner**: Stark
