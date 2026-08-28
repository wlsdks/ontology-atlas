---
uid: 26202cf9-ffbd-48c0-be8b-86173638d678
slug: capabilities/summary-freshness
kind: capability
title: Summary Freshness
domain: domains/graph-modeling
elements: []
path: mcp/src/stale-parent.mjs
created_by: "agent:unknown"
---

## Definition
Reports a `domain` or `project` whose containment list changed after its body prose was last re-written, so its description may no longer cover what it holds. Advisory only: nothing is blocked, no model is called, and no rewrite is proposed, because a summary body is a human judgement that someone accepted.

## Evidence
- mcp/src/stale-parent.mjs: the shared rule, comparing the two clocks that live in one node file
- mcp/src/git-tools.mjs `collectNodeRevisions`: bounded history read for summary nodes only
- src/entities/docs-vault/lib/summary-freshness.ts: the app-side copy, pinned by `tests/contract/summary-freshness-parity.contract.test.ts`
- src-tauri/src/git.rs `vault_node_revisions`: Git plumbing for the installed app, with no ontology knowledge

## Inclusion / Exclusion
- Included: `validate_vault.summaryFreshness`, the `rejudge_summary_membership` maintenance action, and the node-popover row in the installed app
- Excluded: rewriting or regenerating a summary body, and any judgement about whether a child node's own content is current, which path drift already owns
- Included in the nested validation receipt of `health`, `workspace_brief`, and `agent_brief`, as well as explicit `validate_vault` and `maintenance_plan`. Immutable revision bodies are batched and reused under the same Git HEAD; a bounded union-log fallback prevents a quiet summary node from disappearing behind a busy one.

## Why the comparison is prose against membership
Two earlier rules were built and measured against the dogfood vault before this one. Comparing a parent's file timestamp against its children's flagged 6 of 7 domains, and inspection showed every flag wrong: a domain description is written at a level of abstraction that survives its children being revised. Comparing against child creation can never fire at all, because containment is declared in the parent's own frontmatter, so adding a child always touches the parent in the same commit.

## Falsifier
If flagged summaries turn out, on inspection, to still describe their membership correctly, the containment array is the wrong proxy for meaning and this capability should be withdrawn rather than tuned.
