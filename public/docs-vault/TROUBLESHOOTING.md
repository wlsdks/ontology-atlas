# Troubleshooting

Common issues users hit when starting with `oh-my-ontology`. If your case isn't here, open an issue: https://github.com/wlsdks/oh-my-ontology/issues

---

## Vault scaffold (`npx oh-my-ontology init`, desktop app `/docs` button)

### `npx oh-my-ontology` runs an old version

npm caches the package locally. Force a fresh fetch:

```bash
npx --yes oh-my-ontology@latest init my-vault
# or clear the npx cache
rm -rf ~/.npm/_npx
```

### "no new files written — target already has matching files"

The target folder already has `README.md` / `project.md` / etc. — the CLI never overwrites existing files. Either:

- Delete the conflicting files, or
- Use a fresh folder: `npx oh-my-ontology init another-folder`

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

### `oh-my-ontology validate` exits 1 with `unclosed-frontmatter`

Your `.md` file has the opening `---` but no closing `---`. The frontmatter parser is lenient by-design — it returns an empty frontmatter for malformed blocks, so the doc silently disappears from the graph. The validator surfaces this.

Fix: open the offending file (`oh-my-ontology validate <vault>` prints the path) and add the closing `---` line.

### `oh-my-ontology validate` warns `missing-kind` / `unknown-kind`

- `missing-kind` (warning, not error) — the frontmatter has ontology signal keys (`domain`, `capabilities`, `elements`, `relates`, `dependencies`) but no `kind:`. Add `kind: capability` (or domain/element/document/project).
- `unknown-kind` (warning) — `kind:` value is not one of `project / domain / capability / element / document / vault-readme`. Either fix the typo or add to `KNOWN_VAULT_KINDS` if you genuinely need a new kind.

### `oh-my-ontology add` throws `Doc already exists`

Intentional — `add` never overwrites. If you want to update the doc:

- Edit the file directly, or
- Use the MCP `patch_concept` tool (AI agent), or
- Delete the file (`rm`) then re-`add`.

### `pnpm vault:migrate <id> --write` refuses with "commit 안 된 .md 변경"

Safety guard (R11 #21). The migrator refuses to write on top of uncommitted `.md` changes — your work and the migration would mix in the same commit.

Fix: `git stash` or `git commit` your work, then re-run. Or override with `--force` if you understand the risk.

### `pnpm dogfood:walk` fails with `Vault path does not exist`

The walk runs against `docs/ontology/` by default. If you renamed/moved that folder, update `scripts/dogfood-mcp-walk.mjs` (the `VAULT` constant near the top).

---

## MCP server (Claude Code, Cursor, etc.)

### Agent doesn't see `oh-my-ontology__list_concepts` etc.

1. Confirm the MCP server is reachable. Published install: `npx -y oh-my-ontology-mcp` should start a stdio server and wait (Ctrl+C to exit). Source checkout: the generated config should use `node` with an absolute `mcp/src/index.js` path.
2. Check the agent's MCP config — published install uses `command: "npx", args: ["-y", "oh-my-ontology-mcp"]`; source checkout uses `command: "node", args: ["/absolute/path/to/mcp/src/index.js"]`.
3. Set `env.OMOT_VAULT` to the **absolute path** of the vault folder for global agent configs. Project `.mcp.json` can use a path relative to the project root.
4. Claude Code / Cursor: restart the agent so it picks up the project `.mcp.json`.
5. Codex: restart Codex so it picks up the generated `.codex/config.toml`; if you prefer global config, run the `codex mcp add ...` fallback printed by `oh-my-ontology init`.

Clean-room verification for maintainers:

```bash
pnpm smoke:onboarding
```

The smoke creates a temp project with isolated `HOME` / `CODEX_HOME`, confirms
there are no preconfigured Codex MCP servers, then runs the setup from scratch.

### "Vault path does not exist" / `EACCES`

`OMOT_VAULT` must be:

- An absolute path, not relative or `~/...`. Expand `~` yourself.
- Readable and writable by the user running the agent.
- A directory (not a file).

### Agent reads but can't write (`add_concept` fails)

Check the directory's write permission with `ls -ld $OMOT_VAULT`. The agent runs under your shell user; if a parent dir is read-only, writes fail.

### MCP server starts then exits immediately

Usually a Node version mismatch. The server requires Node 20+:

```bash
node --version            # must print v20.x or higher
```

If you use `nvm`, set the agent to invoke `npx` from a v20+ shim.

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
depends_on:
  - capabilities/login
```

…or use the builder canvas (`/ontology/edit`) and connect two nodes with a drag.

### Search palette returns "no results" for everything

Check your vault has at least one `.md` with frontmatter `slug:` and `kind:`. The search index ignores files without frontmatter.

---

## npm publish (maintainer-only)

> If you are *using* the package, you don't need to publish. This section is for project maintainers.

### `403 Forbidden` on `npm publish`

- 2FA OTP wrong or expired — re-run with a fresh OTP.
- Your account doesn't own the package name — try `--access=public` for scoped packages, or use a different name.

### `npm publish` says nothing happened

Likely you forgot to bump the version. npm rejects republishing the same version. Bump first:

```bash
cd mcp
npm version patch                    # 0.5.0 → 0.5.1
npm publish --access=public
```

### "I published the wrong thing"

- Within 24h of publish: `npm unpublish oh-my-ontology-mcp@<version>` removes it.
- After 24h: `npm deprecate oh-my-ontology-mcp@<version> "reason"` — installers see a warning but the version stays.

### Why doesn't Claude Code just run `npm publish` for me?

It can't. `.claude/settings.json` ships a PreToolUse hook that blocks `npm publish` / `pnpm publish` / `yarn publish` until you explicitly type "publish it" in chat. This is intentional — npm publishes are permanent (after 24h) and tied to *your* npm account. See `CLAUDE.md` and `.claude/rules/forbidden.md` for the full rule.

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

- Open an issue: https://github.com/wlsdks/oh-my-ontology/issues
- Discussions: https://github.com/wlsdks/oh-my-ontology/discussions
- Include: OS, Node version (`node --version`), pnpm version, browser (for web issues), exact error message.
