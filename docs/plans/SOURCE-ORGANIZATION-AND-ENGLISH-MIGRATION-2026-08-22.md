# Source Organization and English Migration Plan

## Outcome

Make the repository's active contributor and agent instructions directly readable in English, remove proven dead code, and deepen internal modules without changing the three delivery units or their public interfaces.

The delivery units remain:

1. the private root workbench and macOS application;
2. the bundled `mcp/` server;
3. the source-checkout `cli/`.

File count alone is not grounds for another package. A new package is justified only when independently consumed behaviour needs a real seam with at least two adapters.

## Measured Baseline

Measured in `chore/source-organization` at `c199200e`:

| Inventory | Count |
|---|---:|
| Tracked Markdown files | 596 |
| Generated `public/docs-vault/**` Markdown files | 168 |
| `.agents` mirror files | 35 |
| Canonical authored Markdown files | 393 |
| Canonical files containing Hangul | 352 |
| Canonical Hangul-bearing lines | 38,604 |
| Structurally valid `display_ko` lines | 150 |
| Korean vault-template Hangul lines | 265 |
| Unexpected Hangul code points outside those locale surfaces | 797,775 |
| Operational canonical files containing Hangul | 42 of 47 |

More than half of the authored Korean text is in the two append-only files `docs/DECISIONS.md` and `docs/CHANGELOG.md`. Translating those first would maximize diff size while leaving the files every agent reads at startup unchanged.

## Invariants

- Edit authored sources, never `public/docs-vault/**` or generated JSON by hand.
- Keep `.claude/skills/**` and `.agents/skills/**` byte-identical.
- Keep `.claude/agents/**` and `.agents/agents/**` byte-identical.
- Preserve `display_ko` and the intentionally Korean `cli/templates/vault-ko/**` tree.
- Preserve earlier append-only decision and changelog entries; Git history is evidence, not a translation workspace.
- Keep MCP tool names, schemas, CLI commands, exit codes, and package-script names stable during internal organization.
- Keep `AGENTS.md` below the 32 KiB Codex limit; translate by compressing, not expanding literally.

## Workstream A — Operational English Control Plane

1. Add a Markdown language inventory module and prove its gate with RED/GREEN probes.
2. Translate and compress `AGENTS.md` and `CLAUDE.md`.
3. Translate the ten `.claude/rules/**` files.
4. Translate the fifteen non-English skill entrypoints and copy each result to its `.agents` mirror.
5. Translate the fifteen agent briefs and copy each result to its `.agents` mirror.
6. Require zero unexplained Korean prose in the operational paths while allowing typed locale data.
7. Run an English-only, source-hidden agent handoff comparison before declaring the batch complete.

## Workstream B — Current Product Documentation

After Workstream A is proven:

1. translate current normative developer documentation in bounded batches;
2. translate guides and current product documents, updating heading links and code references together;
3. regenerate the public docs vault after every source batch;
4. translate dogfood ontology prose only after resolving that one raw body is rendered for both `/en` and `/ko`;
5. preserve localized labels and validate the vault after every ontology batch.

Archives, completed plans, audits, and prior append-only records remain historical evidence unless a current workflow demonstrates that their language blocks a handoff. The complete inventory remains visible so this exclusion cannot silently masquerade as completion.

## Workstream C — Proven Code Cleanup

1. Remove `src/shared/ui/entry-choice-card.tsx` after updating and probing the design gate that still names it.
2. Remove the retired `src/features/macos-download-link/` production module and its self-only test after re-pointing or deleting stale gate subjects with a probe.
3. Break the `LocalVaultProvider` cycle by separating the context seam from provider composition; keep the existing consumer interface and focused tests.
4. Extend dead-code analysis beyond the root frontend so CLI, MCP, and scripts are measured independently.

## Workstream D — Internal Module Deepening

Proceed one family at a time, preserving public interfaces:

1. shrink `mcp/src/index.js` into the stdio composition adapter and group internal tool implementations by workflow family;
2. group ontology query implementations behind the existing dispatcher;
3. organize CLI commands and helpers by the workflow families already used by its test lanes;
4. organize quality tooling by docs, agents, design, vault, dogfood, and desktop-release lifecycles;
5. narrow FSD barrel interfaces using measured consumer imports rather than deleting barrels wholesale.

## Verification

Every batch runs all commands returned by `pnpm checks:changed -- --run`. The minimum evidence for the first batch is:

- the language gate fails on an inserted Korean prose probe and returns green after restoration;
- the gate asserts that it scanned non-zero canonical files and locale exceptions;
- `pnpm agents:check` reports zero mirror drift and `AGENTS.md` below its byte cap;
- `pnpm docs-vault:check` and `pnpm docs:links` pass;
- the English-only agent comparison identifies the same source of truth, prohibitions, ontology update path, and verification order without translation assistance.

## Progress — 2026-08-23

- Workstream A is complete: operational Markdown is at 0 unexpected files and
  0 unexpected Hangul code points; agent and skill mirrors are byte-identical.
- Workstream B is complete for active authored Markdown: current documentation,
  guides, the storefront sample, and the dogfood ontology are English. Typed
  `display_ko` labels and the Korean vault template remain locale data.
- Historical append-only and archived sources remain inventoried separately at
  40 files. They are not presented as current English documentation.
- Workstream C removed the two proven dead UI modules and reduced the measured
  root dependency cycles from one to zero by extracting the local-vault context
  seam.
- Workstream D started with the new
  `scripts/quality/markdown-language/` package. MCP, CLI, and broader quality
  family moves remain separate follow-up slices because they require public
  interface and affected-test proofs.
