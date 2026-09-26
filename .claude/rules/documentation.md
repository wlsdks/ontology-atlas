---
paths:
  - "docs/**/*.md"
  - "*.md"
  - "mcp/README.md"
  - "cli/README.md"
---

# Documentation maintenance

Committed documents are the only memory that survives sessions; never leave the
governing document stale after a code change. Which document pairs with which
code change: `git.md`. Which document owns what: `AGENTS.md`, "Documentation,
landing, and instruction integrity".

## Language

Contributor prose is English. Korean appears only as `display_ko` data and
inside `cli/templates/vault-ko/**`. The rule covers strings a program prints:
`cli-output-language.contract.test.ts` holds `cli/src/**` at zero, and the
matcher data in `mcp/src/absorb.mjs` is the `display_ko` exception.
`pnpm docs:language` ratchets the remaining scopes.

## What CI may check about prose

Check only facts a machine can derive; never pin a sentence a person wrote
(`docs/DECISIONS.md`, 2026-08-01). A documentation gate takes one of these
shapes:

| Shape | Repository example |
|---|---|
| Generate, then compare | `pnpm docs:surface:check` diffs `docs/.generated/mcp-surface.json` against the live `tools/list` |
| Referential integrity | `pnpm docs:links`; `assertPnpmScriptsExist` |
| Derive expectations from code | enum inventories, public counts, version agreement |
| Mechanical inventory ratchet | `pnpm docs:language` |

No `assert.match` on prose, no hand-written forbidden-word list, and no pinned
vault-node count. Register a new docs gate in `docs/DEVELOPMENT-CHECKS.md` and
mention its command in `README.md`.

## Records

`docs/DECISIONS.md`, `docs/CHANGELOG.md` and `docs/PO-PILOT.md` are frozen.
Add one immutable fragment per decision, change or release with
`pnpm record:new`, and PO pilot records with `pnpm po:record`; flags live in
`docs/records/README.md`. Never edit a generated composite to resolve a
conflict.
