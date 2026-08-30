---
paths:
  - "docs/**/*.md"
  - "*.md"
  - "mcp/README.md"
  - "cli/README.md"
---

# Documentation maintenance

## Principle

This project does not run without maintained documentation. AI agents continue
the work across sessions; conversations disappear, while committed documents
remain. Never change code and leave its governing documentation stale.

Authored contributor prose is English. Korean remains only where it is typed
locale data (`display_ko`) or inside the intentionally localized
`cli/templates/vault-ko/**` tree. `pnpm docs:language` inventories and ratchets
the remaining migration scopes.

That rule covers the strings a program prints, not only Markdown. `source:language`
reads comments and cannot see a string literal, which is how the CLI came to print
Korean on 140 lines while that gate stayed green;
`tests/contract/cli-output-language.contract.test.ts` now holds `cli/src/**` at zero.
Its Korean *matcher data* for the user's own document lives in `mcp/src/absorb.mjs`
(the CLI executes that module), which is the `display_ko` exception rather than a new one.

## Priority

| Document | Priority | Update when |
|---|---:|---|
| `AGENTS.md` and the `CLAUDE.md` wrapper | 3 | Workflow, rules, or major decisions change |
| `README.md` | 3 | Quick start, commands, or entrypoints change |
| `docs/PRODUCT-DIRECTION.md` | 3 | The mission changes |
| `docs/FEATURES.md` | 2 | A user-visible capability is added or removed |
| `docs/ARCHITECTURE.md` | 2 | System structure or file ownership changes |
| `docs/DESIGN-SYSTEM.md` | 2 | Design tokens or component rules change |
| `docs/DEPLOYMENT.md` | 2 | Deployment changes |
| `docs/CHANGELOG.md` | 2 | A major user-visible change lands |
| `docs/ontology/*.md` | 2 | Dogfood meaning drifts from the implementation |
| `mcp/README.md` | 2 | An MCP tool or signature changes |
| `.claude/rules/*` | 2 | Contributor policy evolves |

## Code/document pairs

The pairing table lives in `.claude/rules/git.md`, an always-loaded rule. This
rule loads only after a Markdown file is opened, which is too late for someone
who has not yet decided to update documentation.

## What CI may check about prose (2026-08-01)

> Check only facts a machine can derive. Never pin a sentence written by a
> person.

The predecessor violated this rule: `check-package-contracts.test.mjs` had
3,419 lines and 2,126 assertions, 1,915 of which (90%) pinned README sentences.
Those pins passed when behaviour changed but prose did not, and failed when a
correct sentence was reworded. They also missed a real reference to a vault node
that regeneration had removed. Full rationale: `docs/DECISIONS.md`, 2026-08-01.

A documentation gate must use one of these shapes:

| Shape | Method | Repository example |
|---|---|---|
| Generate, then compare | Rebuild machine-owned content and diff the committed artifact | `pnpm docs:surface:check` asks the running MCP server for `tools/list` and compares `docs/.generated/mcp-surface.json` |
| Referential integrity | Check that a cited target exists | `pnpm docs:links`; `assertPnpmScriptsExist` |
| Derive expectations from code | Compute both sides instead of hand-writing a prose expectation | enum inventories, public counts, version agreement |
| Mechanical inventory ratchet | Count syntax or characters without asserting what a sentence says | `pnpm docs:language` |

Do not pin human prose with `assert.match`. Do not maintain a hand-written list
of forbidden words; it silently weakens unless someone continually expands it.
Do not pin a vault-node count—documents name the command that derives it.

Register every new docs gate in `docs/DEVELOPMENT-CHECKS.md` and mention its
command in `README.md`.

## Common failures

- Shipping an implementation without its changelog or current-state docs.
- Leaving a design decision only in conversation; after a few sessions nobody
  remembers why it exists.
- Letting dogfood capability or element slugs drift from real files.
- Continuing to cite a deleted file. `pnpm docs:links` catches this; run it after
  regenerating or moving documentation.
- Editing `public/docs-vault/**` directly instead of changing the authored source
  and regenerating.

## Rule of thumb

Write as a letter to your future self and the next agent. A reader should be able
to understand what the project does, how it operates, and why it has this shape
without first reading the code.
