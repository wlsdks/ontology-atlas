---
title: "The CLI and how it relates to MCP"
doc_type: guide
status: current
area: product
---

# The CLI and how it relates to MCP

The Ontology Atlas command-line interface (CLI) works on the same Markdown
ontology folder that the map shows. This chapter covers how to run it, the
commands people use day to day, and how it shares one engine with the MCP
server that coding agents such as Claude Code and Codex call.

## Run it from a source checkout

There is no npm package, so `npx` does not work. The CLI runs from a clone of
the Atlas repository and needs Git, Node.js 24 and pnpm. Keep the clone
outside the repository you want to describe:

```bash
git clone https://github.com/wlsdks/ontology-atlas ~/tools/ontology-atlas
cd ~/tools/ontology-atlas && pnpm install
pnpm --dir mcp install --frozen-lockfile
```

You need both install lines, because the `mcp` folder has its own lockfile.
Then run any command with `node`:

```bash
node ~/tools/ontology-atlas/cli/src/index.mjs --help
```

To type `atlas` instead, run `install-shim`. It writes a one-line launcher to
`~/.local/bin/atlas` that points at this clone, and shows you the launcher
before writing it. `install-shim --uninstall` removes it.

You do not need the CLI to connect an agent. The desktop app has its own copy
of the MCP server and writes the agent config for you (see
[Connect a coding agent](/guide/connect-agent)).

## One engine, three ways in

| Way in | Who uses it |
|---|---|
| The map in the app or the browser version | People |
| MCP tools | Coding agents |
| CLI | People and scripts in a terminal |

The graph commands, such as `backlinks`, `blast-radius`, `rename` and `relate`,
start the MCP server for one call and then stop it. So a command in your
terminal and the same tool called by an agent give the same answer and follow
the same write rules. If these commands time out on a large folder, raise the
time limit with `OATLAS_CLI_MCP_TIMEOUT_MS`.

## Commands for starting

| Task | Command |
|---|---|
| Create an ontology folder with starter files and agent configs | `init ./atlas` |
| Fix the agent configs of an existing folder | `agent-setup ./atlas --write` |
| Check that the MCP server starts and answers | `mcp-verify ./atlas` |
| Preview concept candidates from a repository | `bootstrap . --vault ./atlas` |
| Turn `CLAUDE.md` or `AGENTS.md` into concepts | `absorb CLAUDE.md --vault ./atlas` |
| Bring in existing Markdown files | `import <path...> --vault ./atlas` |

`bootstrap`, `analyze`, `index` and `infer-imports` only preview. They write
no concepts, and `bootstrap` exits with code 3 to say that approval is still
needed. The concepts themselves come from an agent, and you review them, as
described in [Build the first map from your code](/guide/from-your-repo).

## Commands for looking things up

These only read, so you can run them freely.

| Question | Command |
|---|---|
| What is this concept, and what connects to it? | `node <slug> ./atlas` |
| What points at this concept? | `backlinks <slug> --vault ./atlas` |
| What may be affected if this changes? | `blast-radius <slug> --vault ./atlas` |
| How are these two concepts connected? | `path <from> <to> --vault ./atlas` |
| Is there already something like this? | `similar "<title>" ./atlas` |
| Which concepts match a condition? | `query "kind=capability AND has(elements)" --vault ./atlas` |
| What does the whole folder look like? | `overview ./atlas` |
| What should be fixed next? | `maintenance ./atlas` |

## Commands that write

| Task | Command | Default |
|---|---|---|
| Add a concept | `add <kind> <slug> --title "..." --vault ./atlas` | Writes |
| Add a relation | `relate <from> <to> <type> --why "..." --vault ./atlas` | Writes; `--dry-run` previews |
| Remove a relation | `remove-relation <from> <to> <type>` | Writes; `--dry-run` previews |
| Rename a concept and its references | `rename <old> <new> --vault ./atlas` | Preview; `--confirm` applies |
| Merge two concepts | `merge <from> <into> --vault ./atlas` | Preview; `--confirm` applies |
| Delete a concept | `delete <slug> --vault ./atlas` | Preview; refuses while references remain |

Run the matching read command before each write. `relation-check` checks a
relation against the schema before you run `relate`, and `backlinks` shows what
a rename or delete will touch.

## Commands for checking

| Question | Command |
|---|---|
| Is the Markdown valid, and do references resolve? | `validate ./atlas` |
| Do cited source files still exist, and is the graph sound? | `health ./atlas` |
| Which concepts does nothing point at? | `orphans ./atlas` |
| Do dependencies form a loop? | `cycles ./atlas` |
| Which concepts do my staged files touch? | `preflight ./atlas --staged` |

`validate` reads only the ontology folder and exits with code 1 when it finds
errors, so it fits in CI. `health` also compares cited paths with the code, so
it catches a concept whose evidence a refactor deleted. `preflight` never
blocks a commit.

## Commands for agents and sharing

| Task | Command |
|---|---|
| Hand a new agent session its starting context | `agent-brief ./atlas` |
| See status and next actions on one screen | `workspace-brief ./atlas` |
| Commit only the ontology folder, with a summary | `snapshot ./atlas` |
| Export the graph | `export ./atlas --format jsonld` (or `graphml`, `json`) |

`agent-brief` exits with code 1 while the folder still needs attention, for
example right after `init`. Its output is still complete. `snapshot` only makes
a local commit. Add `--push` to push it to the branch's existing upstream, or
`--dry-run` to preview.

Almost every command accepts `--json` for scripts. The help lists every
command with all its options:

```bash
node ~/tools/ontology-atlas/cli/src/index.mjs --help
```

To use these commands to keep the map current, see
[Keep the map current as code changes](/guide/growing-vault).
