# CLI

Your daily entry point. Run it from a source checkout.

```bash
node cli/src/index.mjs --help
```

> This isn't published to a registry, so you can't run it with `npx`. The only live paths are the **app bundle** (the agent connection button writes the absolute path) and **source checkout**.

## Three entry points, one vault

Knowing this before memorizing commands makes the rest easy.

| Entry point | Who uses it |
|---|---|
| CLI | Humans: from the terminal |
| MCP | AI agents: Claude Code · Codex · Cursor |
| UI | Humans: [Studio](/guide/studio) · [Insights](/guide/insights) |

All three view the **same `.md` folder**. Commands that manipulate graphs are actually wrappers around the MCP server, so whether you call `blast-radius` from the terminal or an agent, you get the **same permissions and same answers**. That's why this chapter's table organizes by **"what to call in this situation"** rather than "what commands exist".

## When to call what

### When starting

| Situation | Command |
|---|---|
| Create a vault in an empty repo | `init` (use `--quick-start` for one-line bootstrap) |
| Extract nodes from existing code | `bootstrap`: combines `analyze` + `infer-imports` at once |
| Preview what will be extracted | `analyze` · `infer-imports`: **zero side effects**, suggestions only |
| Load your existing `.md` files | `import <path...>` |
| Fold `CLAUDE.md` · `AGENTS.md` into nodes | `absorb <file...>` |

`analyze` · `infer-imports` · `index` write nothing until you add `--apply`. **Look first, then apply** is the default stance for these three commands.

### While fixing code

| What you want to know | Command |
|---|---|
| What was this concept again? | `node <slug>`: header, lineage, and incoming/outgoing relations on one screen |
| Who uses this name? | `backlinks <slug>` |
| What breaks if I fix this? | `blast-radius <slug>` |
| How are these two connected? | `path <from> <to>` · `explain <from> <to>` |
| Where does it reach from here? | `reachability <slug>` |
| Show only nodes with these conditions | `query "kind=capability AND has(elements)"` |
| Is something similar already there? | `similar "<title>"` |

All these lines are **read-only**. They change nothing, so call them freely.

### Before writing something

| What you want to do | Call first | Then |
|---|---|---|
| Connect a relation | `relation-check <from> <to> <type>` | `relate` (supports `--dry-run`) |
| Rename something | `backlinks` · `blast-radius` | `rename` (dry-run by default) |
| Merge two into one | `similar` | `merge` (dry-run by default) |
| Delete something | `backlinks` | `delete` |

**Write commands almost always have a corresponding read command.** The CLI is designed to check the blast radius before writing. Detailed procedures and actual outputs are in [After the folder grows](/guide/growing-vault).

### Just before committing

```bash
node cli/src/index.mjs preflight --staged
```

Interprets staged files as vault nodes, summarizing what this commit touches. If nothing is touched, it passes silently. **It doesn't block.**

To commit the vault separately, use `snapshot` (check with `--dry-run` first).

### When you don't know what to do

| What you want to ask | Command |
|---|---|
| What does this vault look like? | `overview` |
| What needs maintenance today? | `maintenance` |
| Where can it grow more? | `growth` |
| What's the center? | `hubs`: PageRank · bridges · authority · hub rankings |
| Current situation + next action on one screen | `workspace-brief` |

If you want to view the same queue in the UI, [Maintenance Board](/guide/insights) draws the same `maintenance_plan`.

### When you don't trust the vault

| Doubt | Command |
|---|---|
| Is frontmatter broken? | `validate`: **does not check code paths** |
| Did files cited as evidence disappear? | `health`: six checks, including code path verification |
| Are there nodes no one points to? | `orphans` |
| Do "required items" relations form cycles? | `cycles` |
| Is the graph split into islands? | `components` |
| Is the agent connection config correct? | `mcp-verify` · `agent-setup` · `agent-files` |

The difference between `validate` and `health` is often confusing. **`validate` checks only the documents,
while `health` also checks the code referenced by those documents.** This is why you might see a situation where `validate` passes but `health` fails after refactoring has removed files.

### When passing to an agent · When extracting out

| What you want to do | Command |
|---|---|
| Pass context to a new session | `agent-brief` (formatted for pasting into `--prompt`) |
| Compile definitively | `compile` (normalize relationship arrays with `--fix`) |
| Export to another tool | `export --format jsonld\|graphml\|json` |

`agent-brief` eliminates the need to rewrite context explanations every time you start a new conversation.
It pairs with [Connecting an AI Agent](/guide/connect-agent).

## Two things to know for convenience

**`--json` is available on almost all commands.** Use it when chaining scripts or passing results to other
tools.

**If graph commands time out with a large vault**, increase the wait time for a single call with `OATLAS_CLI_MCP_TIMEOUT_MS`. Since graph commands start and stop an MCP server once, the first response may be slow when the vault is large.

## Full list

There are 52 commands. `--help` displays them all on one screen.

```bash
node cli/src/index.mjs --help
```
