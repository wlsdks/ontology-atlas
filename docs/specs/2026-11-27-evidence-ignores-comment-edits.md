---
title: "Evidence staleness ignores comment and whitespace edits"
doc_type: spec
status: draft
area: ontology-model
date: 2026-11-27
decisions: []
---

# Evidence staleness ignores comment and whitespace edits

A concept is stale when a file it cites (`path:`) changed after the concept's own document last
changed (`mcp/src/drift/evidence-verdict.mjs`, `judgeEvidence`). This spec narrows "changed" to a
change in code: a file whose only difference since the document's newest commit is in comments,
whitespace or blank lines no longer makes the concept stale.

## Person and moment

The owner, who opens the map or `validate_vault` to see which concepts no longer describe their
code. On 2026-11-27 the owner delegated whether to rebuild the staleness rule ("think it through for me", translated)
and then asked for it to be built.

Measured that day on this repository's own vault (`docs/ontology`, 97 nodes): 90 concepts cite a
file; the date rule marks 72 (80%) stale. Comparing each cited file at the document's newest
commit with the file today:

| What changed since the concept was written | Concepts |
|---|---|
| Comments or whitespace only | 10 |
| Code inside functions; exported names and signatures unchanged | 46 |
| Exported names or signatures | 16 |

Git's own whitespace filter (`-w --ignore-blank-lines`) finds 0 of the 72 whitespace-only, so the
10 are comment edits. Three were read as diffs: renaming `add_concept` to `add_concepts` inside a
comment, and deleting a citation to a retired plan. These 10 match the falsifier of
`docs/records/decisions/2026-09-19-drift-line-names-its-evidence-3030afde-cf44-4d45-887e-92ec3dfb3903.md`:
a non-semantic commit flips concepts to stale with no meaning changed.

## Patterns that already solved this

- **Content comparison instead of dates.** floorplan keeps two fingerprints per file, one of the
  content and one of its exported surface, and only the second invalidates a summary;
  OpenWiki and sag-wiki hash the cited range and call a fact stale only when the bytes changed.
  Why it works: the question is whether the text a claim rests on changed, and a date answers a
  different question. How it fails: floorplan ignores body edits, which in Atlas would hide the 46
  concepts whose rules live inside function bodies. What Atlas borrows: the comparison itself,
  computed by code, never by a model. Nothing is copied.
- **Whitespace-insensitive diff.** `git diff -w` has done this for decades. It is safe because
  whitespace carries no meaning in the languages Atlas reads; comment stripping is not
  language-neutral, so it applies only where the comment syntax is known.

What is new here: the comparison runs only on concepts the date rule already calls stale, so it
can only move a concept from stale to current, never hide a newly moved file.

## Behaviour

1. The date rule runs first, unchanged. Only a (concept, file) pair it calls moved is examined.
2. For that pair, read the file at the concept document's newest commit and the file in the
   working tree. Normalize both: remove comments when the extension's comment syntax is known
   (a JSX comment child `{/* ... */}` included), remove module import and re-export
   declarations (JS/TS `import ... from '...'`, bare `import '...'`, `export {...} from '...'`,
   `export * from '...'`; Rust `use ...;`), then remove all whitespace. Equal results mean the
   pair is not moved. A pure import-path move cannot change behaviour without some other line
   changing, except a bare side-effect import pointing elsewhere; that case is accepted. A
   dynamic `import('...')` is code and stays.
3. Comment syntax is known for: `.js .mjs .cjs .ts .tsx .jsx .mts .cts .rs .java .kt .kts .go
   .swift .c .h .cc .cpp .hpp .cs .scala .dart .scss` (`//` line and `/* */` block), `.css`
   (`/* */` only: `url(http://x)` is a value), `.py .sh .bash .zsh .rb .toml .yaml .yml`
   (`#` line). String, template and regex literals are kept intact, so `"http://x"` is not a
   comment. A file holding a construct the scanner does not delimit (an unterminated string, a
   heredoc, a C++ or Swift raw string) compares whitespace only, as does any other extension.
4. If either read fails, the file is larger than 1 MiB, it is binary or not UTF-8, the document
   has no commit, or the pair falls past the first 256 moved pairs, the pair stays moved:
   uncertainty never turns into current.
5. The map, the project page and `validate_vault` give the same verdict: both surfaces call one
   normalizer (`mcp/src/drift/comparable-code.mjs`, bridged into the app) kept identical by the
   existing parity contract.

## Out of scope

- Body changes stay stale. Scoping to cited line ranges (`path:L12-L30`) is the next step; only 2
  concepts cite ranges today, so it waits for construction to write them.
- No vault format change and no new frontmatter key.
- No change to what a person sees for a stale concept beyond the count.

## Acceptance

1. On `docs/ontology` at the merge base, `validate_vault` reports about 21 fewer stale concepts
   than before (measured 72 → 51 on the lead's checkout; 76 → 56 on this branch's base, where
   the vault had moved on), and the map's stale count matches it.
2. A fixture repository where a cited file gains only a comment or a moved import keeps the
   concept current; one where the same file changes a string literal containing `//` makes it
   stale.
3. A read failure or a binary file keeps the concept stale.
4. `tests/contract/analysis/evidence-drift-parity.contract.test.ts` passes with the shared
   normalizer, and one case table runs through both implementations.

## Revisions

- 2026-11-27: first draft from the measurement above.
- 2026-11-27: JSX comment children and module import and `use` declarations are ignored too
  (measured: 11 stale concepts clear by comments, JSX comments and whitespace, 10 more by
  import lines). CSS reads only block comments; constructs the scanner cannot delimit fall back
  to whitespace only; reads stop at 256 pairs.
