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
the module an import names, or whitespace the language does not read no longer makes the concept
stale.

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
- **Whitespace-insensitive diff.** `git diff -w` has done this for decades, for a reader who
  looks at the diff afterwards. Here no one looks, so deleting whitespace is not safe: it carries
  meaning inside strings (`split(' ')`), between tokens (`a - -b`, `.card .title`) and as
  indentation (Python, YAML). Runs of whitespace collapse instead, and only outside literals;
  comment stripping is not language-neutral either, so both apply only where the syntax is known.

What is new here: the comparison runs only on concepts the date rule already calls stale, so it
can only move a concept from stale to current, never hide a newly moved file.

## Behaviour

1. The date rule runs first, unchanged. Only a (concept, file) pair it calls moved is examined.
2. For that pair, read the file at the concept document's newest commit and the file in the
   working tree. Normalize both and compare:
   - Comments are removed when the extension's comment syntax is known, a JSX comment child
     `{/* ... */}` between tags included. The braces of an empty block (`if (x) {/* why */}`)
     stay, and directive comments stay as code: `/// <reference`, `// @vitest-environment`,
     `// @ts-nocheck` and kin, `//go:build`, Python `# type:` and coding lines, Ruby
     `# frozen_string_literal`.
   - Module import and re-export declarations (JS/TS `import ... from '...'`, bare
     `import '...'`, `export {...} from '...'`, `export * from '...'`; Rust `use` and `pub use`)
     become their sorted bound names, aliases, `type` markers and visibility, without the module
     they name. `strict as check` and `loose as check` differ; a new re-export or `pub use`
     differs. A dynamic `import('...')` is code and stays.
   - Each run of whitespace outside string, template and regex literals becomes one space. In
     languages that read line breaks (Go, Kotlin, Swift, Scala, shell, Ruby, TOML) a run holding
     a break becomes one break; in Python and YAML the break keeps the indentation after it; in
     JS a break after `return`, `throw`, `break`, `continue` or `yield` stays. Literals are kept
     byte for byte.

   Equal results mean the pair is not moved.
3. Comment syntax is known for: `.js .mjs .cjs .ts .tsx .jsx .mts .cts .rs .java .kt .kts .go
   .swift .c .h .cc .cpp .hpp .cs .scala .dart .scss` (`//` line and `/* */` block), `.css`
   (`/* */` only: `url(http://x)` is a value), `.py .sh .bash .zsh .rb .toml .yaml .yml`
   (`#` line). String, template and regex literals are kept intact, so `"http://x"` is not a
   comment. A file holding a construct the scanner does not delimit compares its exact lines
   (trailing whitespace and blank lines aside), as does any other extension: an unterminated
   string, a heredoc, a C++ or Swift raw string, a Go file with `import "C"`, or an
   interpolation (`${...}`, `#{...}`, `$(...)`, `\(...)`, an f-string or C# `$"{...}"`) that
   holds the quote of its own string.
4. If either read fails, the file is larger than 1 MiB, it is binary or not UTF-8, the document
   has no commit, a read's 32 MiB budget is spent, or the path, as cited or as its link resolves,
   is hidden or named like a credential (the evidence reader's rule; the desktop app adds the
   code reader's refusal), the pair stays moved: uncertainty never turns into current. Pairs
   are sorted by path and commit and read in chunks of 256 until every one is judged, so both
   surfaces examine the same pairs.
5. The map, the project page and `validate_vault` give the same verdict: both surfaces call one
   normalizer (`mcp/src/drift/comparable-code.mjs`, bridged into the app) kept identical by the
   existing parity contract. The map keeps each pair's verdict while its working file is
   unchanged and gives the main thread back between pairs; it publishes only after the re-read.

## Accepted misses

- **Same names retargeted to another module.** `import { parse } from './parser-v1'` becoming
  `'./parser-v2'`, or `use v1::parse` becoming `use v2::parse`, compares equal although the
  bound code differs. A file move rewrites import paths in every importer, and those importers
  are what this rule exists to clear; a retarget with no other line changing is the price.
- A bare side-effect import (`import './x.css'`) pointing elsewhere compares equal, for the same
  reason.
- The desktop app refuses a few more names than the MCP server (the code reader also refuses
  files under folders such as `credentials/` or `tokens/`, and names such as `database.yml` or
  `env.production`), so a cited file under such a name stays stale on the map while
  `validate_vault` may clear it.

## Out of scope

- Body changes stay stale. Scoping to cited line ranges (`path:L12-L30`) is the next step; only 2
  concepts cite ranges today, so it waits for construction to write them.
- No vault format change and no new frontmatter key.
- No change to what a person sees for a stale concept beyond the count.

## Acceptance

1. On `docs/ontology`, `validate_vault` reports about 20 fewer stale concepts than the date rule
   (measured 78 → 59 at this branch's head, whose own commits touch cited files; the first build
   measured 72 → 51 on the lead's checkout and 76 → 56 here). None of the 59 is held stale by
   whitespace or import names alone. A fixture repository fed through the map's hook and through
   `validate_vault` gives the same stale set
   (`tests/contract/analysis/evidence-text-surfaces.contract.test.ts`).
2. A fixture repository where a cited file gains only a comment or a moved import keeps the
   concept current; one where the same file changes a string literal containing `//` makes it
   stale; a concept citing more than 256 moved files is judged on all of them.
3. A read failure, a binary file, or a hidden or credential-named file, cited or linked to,
   keeps the concept stale, in both runtimes.
4. `tests/contract/analysis/evidence-drift-parity.contract.test.ts` passes with the shared
   normalizer, and one case table runs through both implementations.

## Revisions

- 2026-11-27: first draft from the measurement above.
- 2026-11-27: JSX comment children and module import and `use` declarations are ignored too
  (measured: 11 stale concepts clear by comments, JSX comments and whitespace, 10 more by
  import lines). CSS reads only block comments; constructs the scanner cannot delimit fall back
  to whitespace only; reads stop at 256 pairs.
- 2026-11-27: after review. Whitespace collapses instead of vanishing and keeps line breaks and
  indentation where the language reads them; imports keep their bound names; a retarget to
  another module is the named accepted miss. Interpolations holding quotes fall back to exact
  lines. Hidden and credential-named paths are never read. Every moved pair is read, in sorted
  chunks of 256. Measured 78 → 59.
