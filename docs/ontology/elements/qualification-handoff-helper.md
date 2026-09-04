---
uid: 4e411db0-d689-406c-a299-b9122f173ddd
slug: elements/qualification-handoff-helper
kind: element
title: Qualification handoff helper
display_ko: 자격 검증 도우미
domain: domains/project-portfolio
path: .agents/skills/ontology-bootstrap/scripts/qualification-handoff.mjs
created_by: "agent:unknown"
---

## Definition

The qualification handoff helper is the private source-checkout transport that validates and packages one exact ontology construction candidate from coverage and seal through isolated hidden/audit join, human acceptance, and bounded release calls. Its file-backed contract names complete manifest-claim assignment, the seven quality-axis questions and evidence classes, mandatory versus human-gap-eligible axes, and the distinct witness, claim, target, and diagnostic reference namespaces before an evaluator authors an input.

## Evidence

- `.agents/skills/ontology-bootstrap/scripts/qualification-handoff.mjs`
- `.agents/skills/ontology-bootstrap/scripts/rooted-mcp-read.mjs`
- Primary implementation: `.agents/skills/ontology-bootstrap/scripts/qualification-handoff.mjs#sealCandidate`
- Supporting implementation: `.agents/skills/ontology-bootstrap/scripts/qualification-handoff.mjs#buildHiddenPacket`

## Includes

- The private source-checkout transport that seals one exact ontology construction candidate through coverage, isolated hidden/audit join, human acceptance, and bounded release.
- Defining the file-backed contract for manifest-claim assignment, the seven quality axes, mandatory vs. human-gap-eligible axes, and separate witness/claim/target/diagnostic namespaces.

## Excludes

- Invoking any MCP tool, granting identity or permission, or authoring a meaning judgment: the helper only packages and transports.
- Writing vault content; release is a bounded call the helper prepares, not a vault mutation it performs.
- Evaluating the qualification axes themselves, owned by elements/construction-qualification-evaluator.

## Boundary

It invokes no MCP tool, grants no identity or permission, authors no meaning judgment, and writes no vault content. Missing claim coverage, mandatory-axis evidence, or reference-namespace validity still fails closed; the added contract guidance prevents a fresh evaluator from discovering those requirements only after a rejected submission.
