# Troubleshooting

Common issues users hit when starting with `ontology-atlas`. If your case isn't here, open an issue: https://github.com/wlsdks/ontology-atlas/issues

---

## How this ships (read first)

There are two ways to run Ontology Atlas, and only two:

1. **The installed macOS app.** It carries the MCP server inside its own bundle.
   Open a vault folder and press the connect button — the app writes your agent's
   config with the bundled binary's absolute path. Nothing to install, no terminal.
2. **A source checkout.** Clone the repo and invoke it directly:
   `node <checkout>/cli/src/index.mjs …` for the CLI,
   `node <checkout>/mcp/src/index.js` for the MCP server.

npm publishing is retired (`docs/DECISIONS.md`, 2026-07-27). `npx ontology-atlas`
and `npx -y ontology-atlas-mcp` do not resolve and never will — if a guide
anywhere tells you to run one, that guide is stale.

---

## Vault scaffold (CLI `init`, desktop app `/docs` button)

### "no new files written — target already has matching files"

The target folder already has `README.md` / `project.md` / etc. — the CLI never overwrites existing files. Either:

- Delete the conflicting files, or
- Use a fresh folder: `node <checkout>/cli/src/index.mjs init another-folder`

### Desktop app scaffold button stays grayed out

The button only enables when:

1. You picked a folder via the app's local vault picker *and*
2. The picked handle has read+write permission.

If the app cannot write, click the picker again and choose a non-system folder.

### Local vault picker refuses to write to the picked folder

The desktop app requires:

- A non-system folder. Try a folder under `~/Documents` or `~/Desktop`.
- macOS privacy permission for protected locations such as Desktop or Documents.
- A folder the current user can read and write.

---

## CLI commands (R12 — list / validate / add / find)

### `ontology-atlas validate` exits 1 with `unclosed-frontmatter`

Your `.md` file has the opening `---` but no closing `---`. The frontmatter parser is lenient by-design — it returns an empty frontmatter for malformed blocks, so the doc silently disappears from the graph. The validator surfaces this.

Fix: open the offending file (`ontology-atlas validate <vault>` prints the path) and add the closing `---` line.

### `ontology-atlas validate` warns `missing-kind` / `unknown-kind`

- `missing-kind` (warning, not error) — the frontmatter has ontology signal keys (`domain`, `capabilities`, `elements`, `relates`, `dependencies`) but no `kind:`. Add `kind: capability` (or domain/element/document/project).
- `unknown-kind` (warning) — `kind:` value is not one of `project / domain / capability / element / document / vault-readme`. Either fix the typo or add to `KNOWN_VAULT_KINDS` if you genuinely need a new kind.

### `ontology-atlas add` throws `Doc already exists`

Intentional — `add` never overwrites. If you want to update the doc:

- Edit the file directly, or
- Use the MCP `patch_concept` tool (AI agent), or
- Delete the file (`rm`) then re-`add`.

### `pnpm vault:migrate <id> --write` refuses with "uncommitted .md changes"

Safety guard (R11 #21). The migrator refuses to write on top of uncommitted `.md` changes — your work and the migration would mix in the same commit.

Fix: `git stash` or `git commit` your work, then re-run. Or override with `--force` if you understand the risk.

### `pnpm dogfood:walk` fails with `Vault path does not exist`

The walk runs against `docs/ontology/` by default. If you renamed/moved that folder, update `scripts/dogfood-mcp-walk.mjs` (the `VAULT` constant near the top).

---

## MCP server (Claude Code, Cursor, etc.)

### Agent doesn't see `ontology-atlas__list_concepts` etc.

1. Confirm the MCP server is reachable. Installed app: run the bundled binary directly — `"/Applications/Ontology Atlas.app/Contents/MacOS/ontology-atlas-mcp"` should start a stdio server and wait (Ctrl+C to exit). Source checkout: `node <checkout>/mcp/src/index.js` should do the same.
2. Check the agent's MCP config — the app writes `command: "/Applications/Ontology Atlas.app/Contents/MacOS/ontology-atlas-mcp", args: []`; a source checkout uses `command: "node", args: ["/absolute/path/to/mcp/src/index.js"]`. A config still holding `command: "npx"` predates the app-bundled server and cannot start; press the app's connect button again to rewrite it.
3. Set `env.OATLAS_VAULT` to the **absolute path** of the vault folder for global agent configs. Project `.mcp.json` can use a path relative to the project root.
4. Claude Code / Cursor: restart the agent so it picks up the project `.mcp.json`.
5. Codex: restart Codex so it picks up the generated `.codex/config.toml`; if you prefer global config, run the `codex mcp add ...` fallback printed by `node <checkout>/cli/src/index.mjs init`.

Clean-room verification for maintainers:

```bash
pnpm smoke:onboarding
```

The smoke creates a temp project with isolated `HOME` / `CODEX_HOME`, confirms
there are no preconfigured Codex MCP servers, then runs the setup from scratch.

### "Vault path does not exist" / `EACCES`

`OATLAS_VAULT` must be:

- An absolute path, not relative or `~/...`. Expand `~` yourself.
- Readable and writable by the user running the agent.
- A directory (not a file).

### Agent reads but can't write (`add_concept` fails)

Check the directory's write permission with `ls -ld $OATLAS_VAULT`. The agent runs under your shell user; if a parent dir is read-only, writes fail.

### MCP server starts then exits immediately

In a source checkout, usually a Node version mismatch. The server requires Node 24+:

```bash
node --version            # must print v24.x or higher
```

If you use `nvm`, point the agent's `command` at an absolute `node` path on a
v24+ shim rather than the bare `node` on its `PATH`.

The app-bundled binary does not use your Node at all, so this cannot be the
cause when the config points inside `Ontology Atlas.app`.

---

## Desktop app / source workbench (dev / prod)

### `pnpm dev` 500 error after `pnpm build`

`pnpm build` produces a static `out/` folder, but it can leave `.next/` in an incompatible state. Reset:

```bash
rm -rf .next
pnpm dev
```

### Topology view is blank

The vault may have no edges yet. Add a relation:

```yaml
# in some capability's frontmatter
dependencies:
  - capabilities/login
```

…or open Workshop (`/ontology/studio`) and fill one of the selected concept's
typed relation sockets. A writable vault lands the relation in frontmatter; a
read-only vault gives you the MCP handoff packet instead.

### Search palette returns "no results" for everything

Check your vault has at least one `.md` with frontmatter `slug:` and `kind:`. The search index ignores files without frontmatter.

---

## npm publish (retired)

The project no longer publishes to npm; the macOS app carries the MCP server in
its bundle instead. There is nothing to publish and nothing here to fix. The
old step-by-step guide is kept as a record at `docs/archive/PUBLISH-NPM.md`, and
`.claude/settings.json` still blocks `npm publish` / `pnpm publish` / `yarn publish`
from any AI agent.

---

## Build / test / lint

### `pnpm exec tsc --noEmit` fails after a vault change

Vault is `.md` only — TypeScript shouldn't care. If it errors, you probably changed `src/features/docs-vault-local/lib/ontology-starter.ts` (the in-app scaffold mirror). Make sure the strings match `cli/templates/vault/`.

### `pnpm lint` complains about FSD boundaries

Don't import `widgets/*` from `entities/*` or `features/*`. Direction is one-way: `app → views → widgets → features → entities → shared`. See `.claude/rules/architecture.md`.

### Vitest hangs on `pnpm test`

Use `pnpm test:run` for one-shot mode. `pnpm test` is watch mode.

---

## Hosted demo

### The hosted demo shows different data than my vault

The hosted demo serves *our* dogfood vault (the project's own `docs/ontology/`). Your vault data only appears when you self-host the workbench or run it locally and point it at your own markdown folder via `/docs`.

---

## Still stuck?

- Open an issue: https://github.com/wlsdks/ontology-atlas/issues
- Discussions: https://github.com/wlsdks/ontology-atlas/discussions
- Include: OS, Node version (`node --version`), pnpm version, browser (for web issues), exact error message.
