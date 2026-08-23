# Documentation Guide

This folder is the engineering and product record for Ontology Atlas. For the
product itself, open the map; for live behavior, trust code over prose.

## Current authority

| Need | Source |
|---|---|
| Product direction and shipping behavior | `PRODUCT-DIRECTION.md`, `FEATURES.md`, `../README.md` |
| Product and design decisions | `PRODUCT-OWNER-OPERATING-SYSTEM.md`, `PRODUCT-DESIGN-OPERATING-SYSTEM.md`, `DECISIONS.md` |
| Architecture and routes | `ARCHITECTURE.md`, then `package.json`, `next.config.ts`, and `app/layout.tsx` |
| Ontology model and quality | `ONTOLOGY-ATLAS-SPEC.md`, `ONTOLOGY-QUALITY.md`, `guide/what-becomes-a-node.md` |
| Agent and terminal surfaces | `../mcp/README.md`, `../cli/README.md`, `AGENT-GRAPH-WORKFLOW.md` |
| Verification and release | `DEVELOPMENT-CHECKS.md`, `DEPLOYMENT.md`, `DESKTOP-MACOS.md` |
| Visual rules and map observability | `DESIGN-SYSTEM.md`, `MAP-TESTABILITY.md` |

The vault in `docs/ontology/` is the project's dogfood ontology. Its frontmatter
is graph data; use the MCP/CLI rather than manually guessing graph facts.

## Historical material

`CHANGELOG.md` and `DECISIONS.md` are append-only ledgers. `archive/`,
`audits/`, and `plans/` hold dated context, not current instructions. A deleted
superseded artifact can be recovered from Git when a specific historical question
requires it.

## Updating documentation

Update the authority that owns the change: public behavior in `README.md` and
`FEATURES.md`; MCP/CLI contracts in their own READMEs; routes in
`ARCHITECTURE.md`; decisions in `DECISIONS.md`; user-visible releases in
`CHANGELOG.md`; and new ontology meaning through the ontology-sync workflow.

For documentation work, run the relevant focused checks, then every command
recommended by `pnpm checks:changed -- --run`. Generated docs-vault output comes
only from `pnpm docs-vault:build`; never edit it directly.
