---
slug: cli/src/commands/agent-activity.mjs
kind: element
title: Agent Activity CLI Command
domain: onboarding-ux
relates: [capabilities/agent-live-activity-contract, capabilities/cli-developer-entry]
---

`cli/src/commands/agent-activity.mjs` is the terminal writer for Atlas live agent activity.

It writes, shows, and clears `.ontology-atlas/agent-activity.json` in the selected vault. The command validates the `planning` / `editing` / `verifying` / `blocked` / `complete` state enum, accepts repeated file, plan, MCP, CodeGraph, and verification evidence flags, and returns machine-readable `--json` output for agent automation. That JSON now exposes `reviewMode` directly: `ontology-focus` when the heartbeat names an ontology slug, `business-extraction` when it only names source files, and `none` when no review lane is available. It also exposes `reviewTarget` so an agent or UI can read the ontology slug or source file list that caused that review mode without reparsing the raw heartbeat. It also exposes a `proof` summary with total proof count, per-source MCP / CodeGraph / verification counts, and the same compact label used in human output. When a valid heartbeat is stale, it exposes `refreshRequest` with the previous focus context, a fresh `ontology-atlas agent-activity <vault> ... --json` command skeleton, and the verification rule that the old focus is not current until `--show --json` reports `stale: false`. The human write and `--show` outputs print the same review mode, review target, proof summary, and stale refresh request, so terminal users can tell whether the current work is ontology review or source-to-business extraction and recover stale focus without parsing JSON.

`--show --json` also normalizes handwritten sidecars before deriving summaries:
blank or non-string focus files and evidence entries are ignored, while padded
strings are trimmed before `reviewTarget`, `proof`, and stale refresh commands
are produced. That keeps CLI automation aligned with the app-side parser even
when a hook or external agent wrote the heartbeat directly.

This closes the gap between UI intent and live dogfood: Atlas still does not infer private Claude Code or Codex chat state, but an agent can now publish its current focus through a stable local-first CLI contract.

The repo-local activity hooks now call this command from both Claude Code `Bash` payloads and Codex desktop `functions.exec_command` payloads. The command remains the single writer, while the hooks only normalize runtime payload shapes into `--agent`, `--state`, `--focus`, and evidence flags.

Those hooks now also infer `focus.ontologySlug` from shell commands that mention
this repo's dogfood ontology markdown files. A command that touches
`docs/ontology/capabilities/foo.md`, `domains/foo.md`, `elements/foo.md`, or
`project.md` produces the same focus slug the macOS app uses for `Open focus` and
`Copy focus check`.
