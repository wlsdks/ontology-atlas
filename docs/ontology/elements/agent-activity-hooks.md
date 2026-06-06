---
slug: elements/agent-activity-hooks
kind: element
title: Agent Activity Hooks
domain: ai-agent-partner
relates: [capabilities/agent-config-onboarding, capabilities/agent-live-activity-contract, capabilities/session-start-ontology-context]
---

`.claude/hooks/write-agent-activity.sh` and `.codex/hooks/write-agent-activity.sh` are mirrored repo-local hooks that keep Atlas' live agent activity heartbeat current.

SessionStart writes a quiet `planning` heartbeat so `/ontology` can show that Claude Code or Codex is connected to the vault. PreToolUse reads shell execution payloads, classifies commands as `editing`, `verifying`, or `complete`, and writes the same `.ontology-atlas/agent-activity.json` contract through `ontology-atlas agent-activity`.

The parser accepts both Claude Code's `Bash` / `tool_input.command` payload and Codex desktop's `functions.exec_command` / `tool_input.cmd` payload. This matters for real dogfooding: piping a Codex PreToolUse payload for `pnpm exec vitest run src/features/vault-ontology/ui/LiveActivityIndicator.test.tsx` into `.codex/hooks/write-agent-activity.sh` writes a `codex · verifying` heartbeat that the installed macOS app shows in the route-wide Live trigger.

The hook deliberately stays silent on stdout and exits successfully even when the CLI or vault is unavailable, so it does not block agent work. The heartbeat directory is gitignored because it is runtime state, not ontology content.
