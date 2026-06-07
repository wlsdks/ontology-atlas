---
slug: elements/agent-activity-hooks
kind: element
title: Agent Activity Hooks
domain: ai-agent-partner
relates: [capabilities/agent-config-onboarding, capabilities/agent-live-activity-contract, capabilities/session-start-ontology-context]
---

`.claude/hooks/write-agent-activity.sh` and `.codex/hooks/write-agent-activity.sh` are mirrored repo-local hooks that keep Atlas' live agent activity heartbeat current.

SessionStart writes a quiet `planning` heartbeat so `/ontology` can show that Claude Code or Codex is connected to the vault. PreToolUse reads shell execution payloads, classifies commands as `editing`, `verifying`, or `complete`, and writes the same `.ontology-atlas/agent-activity.json` contract through `ontology-atlas agent-activity`.

The parser accepts both Claude Code's `Bash` / `tool_input.command` payload and Codex desktop's `exec_command` / `functions.exec_command` with `tool_input.cmd`. `.codex/hooks.json` now attaches the publish guard and live activity writer to all three matcher names (`Bash`, `exec_command`, and `functions.exec_command`) so the parser is actually reached in Codex desktop sessions. This matters for real dogfooding: piping a Codex PreToolUse payload for `pnpm exec vitest run src/features/vault-ontology/ui/LiveActivityIndicator.test.tsx` into `.codex/hooks/write-agent-activity.sh` writes a `codex · verifying` heartbeat that the installed macOS app shows in the route-wide Live trigger, and the hook configuration test now proves the same writer is wired to Codex's shell tool names.

The Live popover now keeps the evidence arrays inspectable. It still shows
category counts for MCP, CodeGraph, and verification evidence, but also prints
the first proof trail entry in each category with a `+N` overflow marker. This
keeps human review tied to the actual shared ontology tools and local checks the
agent reported, not only a generic "agent is active" badge.

When a heartbeat includes `focus.ontologySlug`, the same popover turns it into a
review link for the ontology concept map. That makes the heartbeat an entry point
for judging the agent's claimed focus against the shared codebase ontology, not
just a status line beside the navigation.

The focused heartbeat also exposes a copyable focus-check packet. The packet
asks the next human or agent to run `node_profile`, `reachability`, and `health`
against the same slug, then rejects path-only, API-only, or route-only evidence.
That keeps live collaboration tied to business/product meaning and implementation
proof rows. The copy action reports copied/failed state inline so the macOS app
does not leave the handoff outcome ambiguous.

The copied packet now embeds the same business-question handoff used by the graph
DB insights lane. Project focus asks for outcome evidence, domain focus asks for
boundary evidence, capability focus asks for a planner/marketer/leader-readable
claim, and element focus asks for implementation proof rows. That keeps Live
agent review from collapsing back into file-path or command summaries.

When the heartbeat has source files but no selected ontology slug yet, the Live
popover offers a separate business-extraction packet. It asks the reviewer to
name the business/product domain boundary, the human capability claim, and the
implementation proof before recommending an `add`, `patch`, or `skip` ontology
write. That turns code-file activity into an ontology-ingress prompt instead of
leaving the app at a raw path list.

The hook now derives that focused slug from real shell commands. If a Claude Code
or Codex command mentions `docs/ontology/capabilities/*.md`,
`docs/ontology/domains/*.md`, `docs/ontology/elements/*.md`, or
`docs/ontology/project.md`, the writer passes the corresponding slug and source
file into the heartbeat. That keeps the Live focus review link populated during
normal dogfood editing instead of requiring the agent to pass `--ontology-slug`
manually.

The same parser now also lifts normal source paths from shell commands into
`focus.files[]`. Commands that mention files under `app/`, `src/`, `cli/`,
`mcp/`, `scripts/`, `tests/`, or `src-tauri/` publish up to three unique paths.
That gives the macOS app enough live evidence to show the business-extraction
packet even before the agent has chosen or written an ontology slug.

The app-side status parser derives `reviewMode` from the same heartbeat:
`ontology-focus` when a focused slug exists, `business-extraction` when source
files exist without a slug, and `none` otherwise. That makes the collaboration
mode machine-readable for both the Live UI and future automation instead of
leaving every consumer to infer it from raw path arrays.

The hook deliberately stays silent on stdout and exits successfully even when the CLI or vault is unavailable, so it does not block agent work. The heartbeat directory is gitignored because it is runtime state, not ontology content.
