---
slug: elements/context-atlas-quality-bar
kind: element
title: Context Atlas Quality Bar
domain: views
---

`docs/PRODUCT-DIRECTION.md` and `docs/DESIGN-SYSTEM.md` define the top-tier product quality bar for Context Atlas.

This element tracks the explicit requirement that the workbench should feel designer-grade: calm and native enough for macOS, action and motion quality at Apple/Toss-level craft, ontology semantics embedded directly into the UI, graph DB-style query performance and evidence, and an agent surface Claude Code/Codex can use through MCP rather than prose-only memory.

The bar is not decorative polish. Each UI improvement should clarify ontology operations, preserve local-first graph truth, respect reduced motion, and be verified in real runtime surfaces before commit.

Project cards also participate in the quality bar. A project is not just a list item: its focused `Proof · N` ontology action and `Query pack` action should open focused `/ontology/insights?node=...` proof for the project scope, so Claude Code, Codex, or a human reviewer can move from a portfolio overview into graph DB-style node/profile/path evidence without reinterpreting the card copy.

The project-card proof action is a 32px tappable target on mobile, not a tiny count chip. That keeps the ontology concept visible as an executable action: the user can tap the project, inspect its graph proof, then hand the same focused query target to Claude Code or Codex.
