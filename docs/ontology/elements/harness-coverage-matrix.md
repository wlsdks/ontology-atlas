---
uid: 90e673ed-598d-47ae-baed-b11b7fce007f
slug: elements/harness-coverage-matrix
kind: element
title: Harness Coverage Matrix
display_en: Harness Coverage Matrix
display_ko: 하네스 커버리지 표
domain: domains/codebase-architecture
path: src/views/architecture/ui/HarnessCoverageView.tsx
created_by: "agent:claude-code"
---

# Harness Coverage Matrix

The Harness tab's spine: the areas this ontology records for a repository, crossed with what tells, gates and watches each one.

## Definition

A read-only matrix whose rows are the vault's domains and whose columns are Told, Gated and Watched. A file appears in a domain only when a path **it declares** reaches a path the ontology records for that domain: a nested `AGENTS.md`'s own folder, a `.claude` rule's frontmatter `paths:`, a hook script's anchored lane filter, a check command's file arguments, or a workflow's trigger `paths:`. An agent file's own location is never used as a signal: agent files sit at the repository root and say which tool reads them, not which code they govern.

Beside the matrix, every authored Markdown file is split by whether a guide sends an agent to it: a guide, a document a guide names by path, or a document nothing names. Measured by citation, never by glob.

## Includes

- The scope extractors and the disk-resolution pass (`src/entities/agent-files/model/coverage-scopes.ts`, `coverage-collect.ts`).
- The pure areas-by-declarations join (`coverage-matrix.ts`) and the document reachability census (`document-reach.ts`).
- The vault-to-areas derivation that supplies the rows (`src/views/architecture/model/coverage-areas.ts`).

## Excludes

- Any score, grade, maturity level or percentage. What a part of a repository is *for* comes from a reviewed ontology, and a number would assert a judgement the files cannot support.
- Writing. Adding what the matrix reports missing is a separate slice and needs the directional-preview-and-approval pattern relation writing already uses.
- Any claim that a gate ran or a check ever caught something. A wired hook says its script exists.

## Evidence

- `src/entities/agent-files/model/coverage-scopes.ts`: `scopeReaches` is bidirectional prefix containment, not glob matching. A capability `path` is one entrypoint and often a directory, so a rule scoped to `src/**/*.tsx` governs it without matching its string. This is the loosest rule in the join and the reason three rules land on nearly every domain.
- `src/views/architecture/model/coverage-areas.ts`: a domain's purpose is its `description:` when a person wrote one, otherwise a 320-character excerpt of the body. The eight domains in this vault carry `description:` as of 2026-09-13; a domain without one renders a body slice that can run out of its Definition and into its Evidence.
- `src/entities/agent-files/model/repo-scan.ts`: a capability `path` is never checked against the disk by this join. A stale path fails silently in both directions: code that moved out of a scoped folder leaves a cell filled, and code that moved into one leaves a domain marked as named by nothing. `validate_vault`'s `pathDrift` checks existence only, and nothing on this route calls it.
- The Watched column measures how a check command is written in `package.json`, which in a repository whose runner discovers tests by glob is close to orthogonal to what is tested. `discoveredTests` is the second operand the cell prints for that reason.

## Confidence

high (0.9): the join is covered by `tests/contract/harness-coverage.contract.test.ts`, which runs the real scan over this checkout.
