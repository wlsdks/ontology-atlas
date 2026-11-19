---
title: "Connect a coding agent over MCP"
doc_type: guide
status: current
area: product
---

# Connect a coding agent over MCP

This chapter connects a coding agent such as Claude Code, Codex, Cursor or
Antigravity to your ontology folder through MCP, the Model Context Protocol.
Once connected, the agent can read your codebase ontology before it changes
code, and it can record new concepts and relations in the same Markdown files
that the map shows.

## The agent connects to the folder

Your agent starts the Atlas MCP server on your computer when a session needs it,
and the server stops when the session ends. The server reads and writes the
Markdown files in your ontology folder. It opens no port and makes no network
request of its own. The agent itself still talks to its own model provider, as
it always does.

This has three effects:

- The agent can read the folder while the Atlas app is closed.
- What the agent writes appears on the map, because the map reads the same files.
- The connection is a config file in your folder, so it shows in `git diff`
  like any other change.

## Connect from the app

1. Open your ontology folder in the app.
2. Choose **Agents** in the sidebar, then the **MCP** tab.
3. Under **Connect this folder to an agent**, press **Connect** on the row for
   your tool.

| Tool | File the button writes |
|---|---|
| Claude Code | `.mcp.json` |
| Codex | `.codex/config.toml` |
| Cursor | `.cursor/mcp.json` |
| Antigravity | `.agents/mcp_config.json` |

Each button writes only its own tool's file, and only when that file is
missing. The app never overwrites a file that already exists. The config points
at the MCP server that ships inside the app and contains the folder's absolute
path, so you do not need Node.js or a copy of the Atlas source code.

If `.mcp.json` or `.codex/config.toml` already exists but is not an Atlas
connection file, the row shows a warning and offers to copy a corrected config.
Read it and merge it into your file yourself.

Then quit and reopen your agent. An agent reads its MCP config only when a
session starts.

In a browser, Atlas cannot save the config file, because a web page does not
know the folder's absolute path. The MCP tab instead asks you for that path and
for the path of an Atlas source checkout, then builds the config text for you
to copy and save. Nothing is written or sent. The desktop app is the shorter
route: [download it here](https://ontologyatlas.com/en/download/).

## Connect from a source checkout

Without the app, for example on Linux, run the server from a clone of the
repository. You need Git, Node.js 24 and pnpm:

```bash
git clone https://github.com/wlsdks/ontology-atlas ~/tools/ontology-atlas
cd ~/tools/ontology-atlas && pnpm install
pnpm --dir mcp install --frozen-lockfile
```

Then, from the root of your own repository, write the configs for an existing
ontology folder:

```bash
node ~/tools/ontology-atlas/cli/src/index.mjs agent-setup ./atlas --write
```

`agent-setup` creates or repairs `.mcp.json` for Claude Code and
`.codex/config.toml` for Codex. It changes only the `ontology-atlas` entry and
keeps your other MCP servers. A file it cannot parse stays untouched, and the
command prints a template for you to merge by hand.

Any other client that speaks MCP over stdio can register the server with the
same three fields:

```json
{
  "mcpServers": {
    "ontology-atlas": {
      "command": "node",
      "args": ["/absolute/path/to/ontology-atlas/mcp/src/index.js"],
      "env": { "OATLAS_VAULT": "/absolute/path/to/your/atlas" }
    }
  }
}
```

Use absolute paths. A config file does not expand `~`. Codex can also register
the server globally:

```bash
codex mcp add ontology-atlas --env OATLAS_VAULT=/absolute/path/to/your/atlas -- node /absolute/path/to/ontology-atlas/mcp/src/index.js
```

Codex reads a project's `.codex/config.toml` only after you trust that folder.
After you trust it, `codex mcp list` should show `ontology-atlas`.

To give a client read access only, add `"OATLAS_READ_ONLY": "1"` to `env`. The
server then lists only its read tools and refuses every write.

## Check the connection

A config file on disk does not prove that the agent loaded it. After the
restart, ask the agent:

> Call connection_info and tell me which ontology folder and which code
> repository you are connected to.

`connection_info` returns the folder and repository paths the server resolved,
and the tools it offers. If the folder is not the one you expected, fix the
config before you let the agent write.

In the app, **Confirm the connection** beside the heading shows the restart
step and the state of each tool's file. From a terminal, `mcp-verify` starts
the server, lists its tools and runs real queries against the folder:

```bash
node ~/tools/ontology-atlas/cli/src/index.mjs mcp-verify ./atlas
```

It proves that the server and the folder work. It does not prove that your
agent has loaded the config.

## What the agent can read and write

The server's own tool list is the exact inventory. The tools fall into a few
groups:

- **Read before work:** `get_concept` returns a concept with its neighbors,
  `find_backlinks` shows what points at a concept, `find_path` shows how two
  concepts connect, and `query_ontology` answers questions such as a workspace
  overview or the impact of a change.
- **Read the code:** `analyze_repo_structure`, `index_project` and
  `infer_imports` survey a repository without writing anything.
- **Write:** `add_concepts`, `add_relations`, `patch_concept`, `rename_concept`,
  `merge_concepts`, `delete_concept` and a few more. Rename, merge, delete and
  relation removal preview their changes first and write only when called again
  with confirmation.
- **Check:** `validate_vault` and `compile_ontology` report broken references
  and missing parts.

Every write lands as a Markdown change. A write tool also refuses to overwrite
a file that changed on disk after the agent read it.

## What you still decide

- **Whether a write needs your approval.** With an external agent, its own
  permission settings decide this. In the app's built-in agent conversation,
  each write asks you first unless you turn on **Auto-approve**.
- **Whether the meaning is right.** A successful write is not an accepted
  meaning. Read the diff before you commit it.
- **What the agent works on.** On the map, **Copy prompt** in a concept's
  actions copies that concept's context for your agent.

The **Agents** tab on the same page lists the coding tools found on your
computer and checks that they can run. In the app it can also open a
conversation with one of them beside the map, using the same MCP server.

Next: [build the first map from your code](/guide/from-your-repo). For what
leaves your computer, see [data, privacy and safety](/guide/trust).
