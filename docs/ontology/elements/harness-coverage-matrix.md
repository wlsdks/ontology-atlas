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

## Confidence

high (0.9): the join is covered by `tests/contract/harness-coverage.contract.test.ts`, which runs the real scan over this checkout.
