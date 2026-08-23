# Domain Docs

Ontology Atlas is a single-context product implemented across the web workbench, the macOS shell, the CLI, and the MCP server. Engineering skills should use the same product vocabulary across all of these packages.

## Read Before Exploring

- `docs/PRODUCT-DIRECTION.md` for the product mission and target outcomes.
- `docs/FOUNDATIONS.md` for the grounding concepts and established terminology.
- `docs/ARCHITECTURE.md` for the system structure and package responsibilities.
- `docs/DECISIONS.md` for standing decisions and their falsifiers. Treat it as this repository's append-only decision authority.
- `CONTEXT.md` and `docs/adr/` when they exist. These are created lazily if a future architecture discussion establishes a domain glossary or a focused architectural decision that is not already covered by the decision ledger.

Read only the sections relevant to the area being changed. Do not treat the absence of `CONTEXT.md` or `docs/adr/` as an error.

## Use Established Vocabulary

Use terms from the sources above in proposals, issue titles, tests, and module names. If a needed term is missing or ambiguous, record the ambiguity during design instead of introducing an unreviewed synonym.

## Flag Decision Conflicts

If a proposal conflicts with `docs/DECISIONS.md` or a future ADR, identify the exact record and explain why current evidence may justify reopening it. Do not silently override an existing decision.
