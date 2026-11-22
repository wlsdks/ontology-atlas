# cli — the init command

`cli/` holds one command. It scaffolds an Ontology Atlas vault and wires this
checkout's MCP server into the coding agents that will read it. Everything an
agent reads or writes after that goes through the MCP server
([`mcp/README.md`](../mcp/README.md)); the app is where a person reads and
corrects the result.

There is no npm package and no installed `ontology-atlas init` binary. The
command runs from a source checkout as `node <checkout>/cli init`, which needs
Node.js 24, the same floor as the MCP server. People who use the installed
macOS app do not need it: the app's first-run starter writes the same vault and
its Connect a coding agent dialog writes the agent config.

## Use it from a source checkout

```bash
# Keep the tool outside the project you are describing.
git clone https://github.com/wlsdks/ontology-atlas ~/tools/ontology-atlas
cd ~/tools/ontology-atlas && pnpm install
pnpm --dir mcp install --frozen-lockfile   # mcp/ has its own lockfile

cd /path/to/your/repo
node ~/tools/ontology-atlas/cli init ./atlas
```

| Flag | Effect |
|---|---|
| `[folder]` | Where the vault goes. Default `./atlas`. |
| `--locale=ko` | Korean starter pages instead of English. |
| `--documents` | A documents folder (`sources/` and `wiki/`) without the map's starter nodes or skills. |

Run it in your own repository, not inside the Atlas clone, which ships a
committed `.mcp.json` pointing at Atlas's own vault.

## What it writes

- The starter vault: `project.md`, one example domain, capability and element,
  `wiki/`, and the vault's `AGENTS.md` and `CLAUDE.md`.
- The starter skills in `.claude/skills/` and `.agents/skills/` where the
  agent starts: the repository root when the vault sits inside it, otherwise
  the vault.
- `.mcp.json` and `.codex/config.toml` pointing at `mcp/src/index.js` in this
  checkout, or at the server bundled in the installed app when no checkout
  server is found. `OATLAS_MCP_PATH` overrides both.

A file that already exists is kept, never overwritten. A parseable client
config is rebound while unrelated entries stay; a malformed one is left alone
beside an adjacent `.example` file to merge by hand, and init exits 1.

## After init

Restart the coding agent, then call `connection_info` to confirm the vault and
repository roots it resolved. Build the map with the `/atlas-grow` skill; the
[repository walkthrough](../docs/guide/from-your-repo.md) shows the order. If
the MCP connection is missing, an agent reads the vault's Markdown directly,
writes nothing, and says so.

## Tests

```bash
pnpm test:cli
```

`cli/src/main.test.mjs` runs `node <checkout>/cli init` in a temporary folder;
the other tests sit beside the module they cover.
