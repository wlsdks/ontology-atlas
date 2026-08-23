# CLAUDE.md

[`AGENTS.md`](AGENTS.md) is the canonical contributor guide. This file imports it
and adds only material visible to Claude Code.

@AGENTS.md

## Agent skills

### Issue tracker

Use GitHub Issues for deferred or discussion-heavy work; small, immediately
actionable changes may go directly from a branch to a pull request. See
`docs/agents/issue-tracker.md`.

### Triage labels

Use the five canonical triage labels in `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repository. See `docs/agents/domain.md` for the domain
and decision sources engineering skills must read.

## Which tool reads what

The tools do not see the same files. Put a rule in the wrong tree and one tool
silently works without it.

| | Claude Code | Codex |
|---|---|---|
| `AGENTS.md` | through this file's `@AGENTS.md` import | directly, up to `project_doc_max_bytes` (32 KiB by default) |
| `CLAUDE.md` and `.claude/**` | reads them | does not read them |
| `.agents/skills/**` and `.agents/agents/**` | — | reads them |
| `.codex/**` | — | reads `config.toml` and `hooks.json` |

The two agent trees have the same shape: each has `skills/` and `agents/`, and
paired files are byte-identical. A relative reference such as
`../../agents/po-*.md` therefore resolves inside the matching tree. Do not name
a tool inside a shared skill body; that makes one copy point into the other
tool's tree. Branch on capability instead, for example whether parallel
subagents are available. Contracts:
`tests/contract/{po,design}-council.contract.test.ts`.

Three rules follow:

1. Put rules both tools need in `AGENTS.md`. A rule found only under
   `.claude/rules/` does not exist for Codex.
2. Keep `AGENTS.md` below 32 KiB. Codex truncates excess bytes silently, even in
   the middle of a sentence. At 39,617 bytes, the vault write loop and
   frontmatter schema disappeared from its context (measured 2026-07-31).
   `pnpm agents:check` enforces the cap and warns below 10% headroom.
3. Keep skill and agent-brief pairs identical:
   `.claude/skills/<name>/` ↔ `.agents/skills/<name>/` and
   `.claude/agents/<seat>.md` ↔ `.agents/agents/<seat>.md`.
   `pnpm agents:check` detects drift and one-sided files. A missing mirror once
   caused Codex to measure a guide-covered screen and later forced it to invent
   fifteen unavailable review seats (measured 2026-08-04). Add new seats to both
   trees; never create a third copy.

## Claude Code only

- `.claude/rules/*.md` contains ten detailed rules. Three are always loaded;
  seven use frontmatter `paths:` and load only when relevant. This reduced the
  per-turn rule context from 73 KB to 13.6 KB without deleting policy.

  Conditional does not mean free. In 2026-08-05, opening any `.tsx` loaded a
  63.4 KB `design.md`, 43% of which was gate history. Splitting that history into
  `design-gates.md` reduced the recurring cost. Keep rules (what) separate from
  history (why).

  | Loading | Rule | Trigger |
  |---|---|---|
  | always | `forbidden`, `git`, `local-first` | Decisions required before any file is opened: publishing, backend use, and commit workflow |
  | conditional | `design` | UI files such as `src/**/*.tsx` and `app/**/*.css` |
  | conditional | `design-gates` | `eslint.config.mjs`, `tests/contract/**`, `scripts/check-*.mjs`; only while changing gates |
  | conditional | `architecture` | `src/**`, `app/**`, `next.config.ts` |
  | conditional | `testing` | `**/*.test.*`, `tests/**`, test configuration |
  | conditional | `surfaces` | `src/shared/lib/tauri-*.ts`, `src-tauri/**`, `tests/e2e/**` |
  | conditional | `documentation` | `docs/**/*.md`, root `*.md` |
  | conditional | `codegraph` | `src/**`, `mcp/**`, `cli/**`, and other code; `AGENTS.md` carries its always-loaded trigger summary |

  A glob matching zero files silently disables its rule. This happened when a
  rule named `i18n/**` while the real path was `src/i18n`. Directory moves are
  guarded by `tests/contract/rules-path-scope.contract.test.ts`. Adding an
  always-loaded rule requires updating that test's `ALWAYS_LOADED` list with a
  reason; otherwise the 73 KB context returns for free.
- `.claude/agents/*.md` contains the standing reviewers: `chief`, five `po-*`
  seats, eight `design-*` seats, and `design-guardian`. They load only when
  convened.
- `.claude/settings.json` owns hooks and permissions.
- `.claude/hooks/` has four hooks mirrored under `.codex/hooks/`: block npm
  publishing, block irreversible Git commands, block hand-editing generated
  files, and inject a compact vault inventory at SessionStart. Changing the hook
  set requires `pnpm test:claude:hooks`; the suite once stayed red for two weeks
  after a two-to-four-hook expansion nobody tested.

The shared skills (`/po-pass`, `/po-council`, `/design-council`,
`/design-audit`, `/design-system-audit`, `/design-build`, `/user-walkthrough`,
`/motion-verify`, `/responsive-sweep`, `/gate-probe`, `/ontology-sync`,
`/ontology-bootstrap`, `/ontology-extract`, `/ontology-absorb-confluence`,
`/ontology-field-trial`, and `/parallel-brief`) are not Claude-only. They are
subject to the mirror rule above. `AGENTS.md` owns invocation triggers and
protocols; `docs/DECISIONS.md` owns decisions and losing dissent.

## Synchronization policy

`AGENTS.md` is the single source of truth and this file is a thin wrapper. A
change to `AGENTS.md` does not require changing this file unless the visibility
table itself changed.

The `@AGENTS.md` import organizes context; it does not reduce it. Imported bytes
still enter every session, so do not grow the file on the assumption that an
import is cheap.
