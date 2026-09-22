---
uid: df5c25f8-b789-48b7-9dc9-76d2a4f8d2f0
slug: elements/meaning-gap-findings
kind: element
title: Meaning gap findings
display_en: Meaning gap findings
display_ko: 의미 결락 검출
domain: domains/meaning-layer
path: mcp/src/meaning-findings.mjs
created_by: "agent:claude-code"
---

Reads a node's prose rather than its frontmatter and names what a concept is missing: no definition sentence, no stated boundary, no stated unknown, and, where a repository root is known, a declared dependency nothing witnesses and a starter example still sitting in a map that has outgrown it.

## Includes
- The definition, boundary and uncertainty checks a write path reports back immediately.
- The rule that an exclusion describing what the author did not read is not a product boundary.
- A dependency check that asks whether the citing node's own file, or any file the edge's stated reason names, brings the target in through an import, require, use or include statement, with `mod.rs`, `index.*` and `__init__.py` answering to their folder, so a third file such as a bridge or a contract test can be the witness when neither end imports the other, and a bare word inside an identifier never is.
- Recognition of the example nodes the starter templates ship, so one can be named once the vault holds a real map of its own.

## Excludes
- Blocking a write; every finding is a warning naming its own repair.
- Judging whether a present definition is accurate.
- Reading call sites: an import proves the file is brought in, not that the imported symbol is called.

## Uncertainty
- Read the dependency-witness rule end to end (`mcp/src/meaning-findings.mjs:556-620` for the specifier reader and `:716-799` for the edge walk), including why a note path is also looked for from each ancestor folder of the citing file. The starter-example rule was read only at its opening; its body was not opened. The specifier patterns were exercised on this vault (7 edges exposed and repaired) and on one Rust vault (2 exposed); no Go or Python vault has been validated under them.
