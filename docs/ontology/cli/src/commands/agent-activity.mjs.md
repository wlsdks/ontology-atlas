---
slug: cli/src/commands/agent-activity.mjs
kind: element
title: Agent Activity CLI Command
domain: onboarding-ux
relates: [capabilities/agent-live-activity-contract, capabilities/cli-developer-entry]
---

`cli/src/commands/agent-activity.mjs` is the terminal writer for Atlas live agent activity.

It writes, shows, and clears `.ontology-atlas/agent-activity.json` in the selected vault. The command validates the `planning` / `editing` / `verifying` / `blocked` / `complete` state enum, accepts repeated file, plan, MCP, CodeGraph, and verification evidence flags, and returns machine-readable `--json` output for agent automation.

This closes the gap between UI intent and live dogfood: Atlas still does not infer private Claude Code or Codex chat state, but an agent can now publish its current focus through a stable local-first CLI contract.
