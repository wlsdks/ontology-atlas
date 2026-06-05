---
slug: capabilities/agent-config-onboarding
kind: capability
title: Agent Config Onboarding
domain: ai-agent-partner
dependencies: [capabilities/mcp-server, capabilities/vault-live-updates]
elements: [src/features/docs-vault-local/lib/ontology-starter.ts, src/features/docs-vault-local/model/use-local-vault.ts, src/features/docs-vault-local/ui/OntologyStarterCta.tsx, src/views/docs-vault/ui/DocsVaultPage.tsx, src/views/ontology-view/ui/parts/AgentStatusPopover.tsx, src/widgets/docs-vault/ui/VaultToolsMenu.tsx]
relates: [domains/ai-agent-partner, domains/onboarding-ux]
---

로컬 vault 를 Claude Code / Cursor / Codex 에 붙이는 설정 파일을 사람이 확인하고 복구할 수 있게 하는 onboarding surface.

`VaultToolsMenu` exposes the setup gate in the same language as `agent_brief` / `workspace_brief`: CLI-only, MCP-connected, Graph DB pack, and Setup gate. The panel now separates vault health, config readiness, agent-root guidance, and JSON gate proof so a developer can tell whether they should restart from the vault folder or copy the codebase-root templates before editing from another repository.

The copy packet includes MCP/Codex templates, restart guidance, verification prompts, CLI fallbacks, and the machine-readable JSON gate that reports `ok` and `performanceOk` independently. It now starts with an explicit root check: the agent root is the codebase root where Claude Code / Codex is opened, while the ontology vault is passed as a separate path when it is not the current working directory. The full packet exposes both JSON gate contexts: codebase-root automation passes the shell-quoted vault path, and vault-folder automation keeps the `.` cwd command. The packet also includes a machine-readable `ontology-atlas agent-setup <vault> --root <codebase> --json` dry-run so setup state can be checked before the repair command creates missing config files.

The setup packet now includes a numbered read-first run order for codebase-root launches: check config state, repair only missing configs, restart the agent, run `mcp-verify`, run the JSON fallback performance gate, then read `workspace-brief` and `agent-brief --prompt`. The UI mirrors that order by exposing a separate `agent-setup ... --json` state-check copy action before the warmer-colored `agent-setup ... --write` repair action, and the visible checklist now continues past restart / JSON gate into `mcp-verify` and read-first graph proof. Copied codebase-root commands quote the vault path placeholder anywhere it is passed as a shell argument, so a vault path with spaces remains executable after the user replaces the placeholder. Users can therefore follow the same setup gate from the panel without opening the full packet first: inspect readiness, repair only missing configs, restart from the agent root, prove the 23 MCP tools are reachable, then read the workspace and agent brief before any ontology write. That keeps Claude Code, Codex, and terminal-only users aligned on the same first-contact sequence before any ontology write.

The setup card also exposes a smaller first-contact proof packet for already-installed CLI sessions. It copies only the minimum sequence needed to prove a codebase-root agent session is ready: `agent-setup ... --json`, a repair-only-if-missing `agent-setup ... --write` command, restart guidance, `mcp-verify`, the JSON fallback `agent-brief --verify-fallbacks`, an MCP-connected proof sequence (`query_ontology(workspace_brief)` → `query_ontology(agent_brief)` → `query_ontology(health)` → `query_plan(match_nodes)` → `match_nodes`), and CLI fallback proof with `workspace-brief`, `agent-brief --prompt`, and `agent-brief --graph-db-pack`, followed by the same JSON gate result rules and post-change ontology sync rule. The compact proof packet uses the same shell-safe vault-path placeholder as the full setup packet, so Claude Code / Codex can paste it into a terminal-first setup flow without hand-fixing path quoting. This gives Claude Code / Codex a compact proof script without copying the full config templates while still closing the setup-check-to-repair loop when config files are missing.

The setup prompt and packet also carry the post-change ontology sync rule from the agent brief write policy: after a non-trivial code change introduces or renames a domain, capability, element, or relation, sync `docs/ontology` before finishing; typo, comment, style-only, lint-config, and fixture-only changes can skip sync. The setup card now also exposes that sync gate as its own copy action, so an already-connected Claude Code / Codex session can copy only the `health` / `cycles` / `growth_plan` / `maintenance_plan` / `validate_vault` MCP and CLI packet immediately after a code change without copying the full setup packet again.

The CLI `agent-setup` command exposes the same rule in both terminal output and JSON (`docs.postChangeSync`), keeping codebase-root setup repair, UI setup packets, and Claude/Codex automation gates aligned on the same after-edit behavior. Its JSON and terminal output also include the same first-contact graph runbook used by the UI setup card: `validate`, `mcp-verify`, `agent-brief --verify-fallbacks`, `workspace-brief`, `agent-brief --prompt`, `agent-brief --graph-db-pack`, and hub scans over the selected vault path. The command now also prints and returns separate `setupState`, `setupRepair`, and restart guidance entries, and the human `Next checks` order matches the UI first-contact sequence: inspect config state, repair only missing configs when needed, restart Claude Code / Cursor / Codex from the agent root, then run `mcp-verify` and the JSON fallback gate before reading graph briefs.

`agent-setup` JSON, terminal output, the full UI setup packet, and the compact first-contact proof packet now share one first-contact proof contract: `config_state`, `mcp_verify`, `json_gate`, and `graph_briefs`. The UI packet now spells out both sides of `graph_briefs`: MCP-connected agents run `workspace_brief`, `agent_brief`, `health`, and a bounded `match_nodes` plan through `query_ontology`, while connector-less sessions run the matching CLI fallbacks. That means codebase-root and vault-root setup readiness, the 24-tool MCP boot proof, fallback `ok` / `performanceOk`, and `workspace-brief` / `agent-brief --graph-db-pack` all use the same labels before an agent edits the codebase. The setup surface is therefore no longer just a template copier; it is a repeatable proof that Claude Code, Codex, Cursor, and terminal-only users are reading the same local vault through the same graph language before writes.

The visible setup card now shows that same first-contact proof contract before
the copy actions. Users see `config_state`, `mcp_verify`, `json_gate`, and
`graph_briefs` in the UI itself, not only inside the copied packet or CLI JSON.
That keeps the panel, terminal `agent-setup`, and Claude Code / Codex setup
automation aligned on the exact evidence order.

The setup card now also shows the root execution contract directly in the UI:
`vault folder` means the agent is opened inside the ontology vault and commands
can use `.` as the vault path, while `codebase root` means the agent is opened
inside another product repository and setup-state, repair, `mcp-verify`, and
JSON gate commands must pass the ontology vault as an explicit absolute path.
This makes the codebase-root versus vault-folder distinction visible before a
user copies any setup command or config template.
