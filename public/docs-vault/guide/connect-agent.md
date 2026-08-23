# Connecting an AI Agent

It’s just one click on the app's **"Connect Agent"** button. Once you select the tool you're using, it writes a configuration file for that tool containing the **actual absolute path of the vault**.

| Tool | File used |
|---|---|
| Claude Code | `.mcp.json` |
| Codex | `.codex/config.toml` |
| Cursor | `.cursor/mcp.json` |
| Antigravity | `.agents/mcp_config.json` |

One button writes one file. It does not create files for unselected tools.

## What connects to what

If you get confused here, everything else will seem wrong.

> **The agent connects to the folder, not to the Atlas app.**

The agent starts a small server (MCP server) within its own session, and that server reads and writes directly to the vault folder on disk. The Atlas app is **another reader viewing the same folder**. Therefore:

- The agent can read the vault even if the app is not running.
- Changes made by the agent appear on the app screen (because the folder has changed).
- **Web users are also connected.**

## Connecting via the web

The only thing the web cannot do is **save the configuration file for you**, because the browser does not know your disk's absolute paths. But you do.

So the sheet asks for two paths.

1. The absolute path of the vault folder
2. The absolute path of the Atlas source checkout

It generates the tool-specific configuration text and verification command right there. **It does not write any files, nor do the paths leave the screen.** Nothing is transmitted or saved. You just paste the generated text into your file, and you're done.

Incomplete configurations are not copied. Unconnected settings are a trap, not a help.

## Scope: This folder / Entire computer

"This folder" writes to the repository's config file. It persists in `git diff` and is shared by the team.

"Entire computer" refers to settings in the home folder, which **the app does not use directly**. That file is a state store updated by tools at runtime; if a third party modifies it, silent data loss occurs. Instead, provide a single command with the Vault absolute path already embedded, letting the tool use its own copy. The fact that changes to the home folder do not appear in `git diff` is also evident from the screen.

## Verifying Connection

**You must restart the tool after writing the configuration.** The MCP server list is read at session start.

Once connected, ask the agent this:

> Which vault are you currently connected to?

The agent calls `connection_info` and reports the **parsed vault path and repository path**. If it is not the folder you expected, verify it there: proceeding with writes in this state will modify the wrong folder.

To verify via terminal:

```bash
node cli/src/index.mjs mcp-verify my-vault
```

This checks if the server is running, lists tools, and confirms actual queries work.

To modify only an existing repository's configuration:

```bash
node cli/src/index.mjs agent-setup my-vault --write
```

Do not touch the start file; only adjust agent settings. If the existing config can be parsed, keep other MCP servers and TOML sections intact, and atomically replace only the `ontology-atlas` entry with this vault. If JSON is broken or Atlas sections are duplicated, do not modify the original; instead, restore the example and nonzero review status. If the existing example can be parsed, change only the Atlas item and preserve the rest. If the example itself is broken, leave the original example as-is and create a `.ontology-atlas-current.example` sidecar containing only the current connection. When recreating a new vault in the same codebase folder, restart the agent and verify `vaultRoot` in `connection_info` to confirm the switch is complete.

Codex reads project settings only after approving the folder as **trusted**. Before approval, even if `.codex/config.toml` looks correct, `codex mcp list` will not show Atlas. After trusting the folder, run `codex mcp list` in that folder and sequentially verify that `ontology-atlas` appears and matches the path in `connection_info`.

## What Changes When Connected

**Before starting work**: The agent first reads the concepts and neighbors it will touch.

- `get_concept({ slug })` or `get_concept({ uid })`: Fetches nodes and neighbors at once using current address or permanent identity
- `find_backlinks(slug)`: Checks who relies on the name before renaming
- `find_path(from, to)`: Checks if a relationship already exists

**After work**: Records newly created items.

- `add_concept(...)`: New capabilities/elements
- `rename_concept(...)`: Rewrites all backlinks if the name changes
- `merge_concepts(...)`: Merges two nearly identical nodes
- `finalize_project_meaning(...)`: Leaves a project meaning receipt after approved writes, verification, and full compilation. It does not store original answers or private source roots; `ok: true` indicates successful receipt recording, not completion of meaning verification

The exact current list of read/write tools is provided by the running server's `tools/list`. `mcp-verify` confirms that this list matches the initial instructions and that the vault is actually readable.

### How the Agent Uses UID and Slug

Node responses always include both `{ uid, slug }`. The agent uses `uid` for long-lived handoffs, work targets, and sources; use `slug` when displaying to humans or creating relationships/URLs/CLI commands.

- Querying by UID finds the same node even after renaming.
- Querying by slug allows using a readable address from the current vault.
- Do not copy `uid` into relationship arrays or URLs; their surface address specification remains slug.

## First Conversation: What to Ask

This is where you might pause, unsure what to say after connecting. Here are questions that actually yield answers:

- "What does the authentication side of this folder's map rely on?"
- "What breaks if I fix `token issuance`?" → Impact scope
- "Where is the strangest part of this map right now?" → Triage queue
- "Reflect this newly created feature in the map." → Write nodes/relationships. The result remains as one line in `.md`
  diff.

**The key is not to re-paste the session background explanation.** You can ask the agent if needed.

## Starting a New Session: Handoff

To pass the background to a new session all at once:

```bash
node cli/src/index.mjs agent-brief my-vault
```

If there are multiple projects, select one with `--project SLUG`. The output's
`meaningAssessment` will be one of `verified_current`, `review_required`,
`needs_evidence`, or `invalid`. When evidence cannot be confirmed,
it returns a fail-closed state without guessing.

**Exit code 1 is not a failure.** The `1` in this command signals that "the graph is still maturing." Newly created vaults usually return `1` because they have few nodes. The command itself completed successfully, and the output is valid. If you chain it like `agent-brief && next-command`, it will stop at that `1`. Instead, use `--exit-zero` and read the `status`/`readiness` from the output directly.

```
agent brief healthy — readiness ready 100/100 · 70 nodes · 152 relations · 6 health checks

ENTRYPOINTS (highly connected nodes the agent sees first)
   1 domains/onboarding-and-shell   — Onboarding, Distribution & App Shell  deg 33
   2 domains/topology-navigation    — Topology Map Navigation               deg 25

FIRST MCP CALLS
  query_ontology({"operation":"workspace_brief","limit":5})
  query_ontology({"operation":"health","limit":5})

CLI FALLBACKS (MCP connector unavailable)
  ontology-atlas workspace-brief [vault] --limit 5
```

It provides both the **entry node** (most connected) and the **first call**. For agents that haven't yet attached to MCP, it also includes the equivalent CLI commands.

The map view also has an "AI Summary Copy" button for each node, allowing you to copy and paste just the context of that single concept.

## Humans Are the Judges

What the agent writes is just Markdown. It appears in `git diff`, and if it's wrong, you fix it manually. This is where it differs from "agent-only memory." A repository that humans cannot see is one they cannot trust.

It also prevents one party from silently overwriting changes when humans and agents edit the same file simultaneously ([after the folder grows](/guide/growing-vault), Section 6).
