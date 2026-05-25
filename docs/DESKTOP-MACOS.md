# macOS Desktop App Track

`oh-my-ontology` can become a macOS-installed app without changing the source of
truth. The desktop app should be a native shell around the same local markdown
vault, not a backend, cloud sync layer, or second data store.

## Current Decision

Use Tauri first for the prototype. The repository now includes the first
`src-tauri/` shell so desktop work can move from planning to local app smoke.

- The web app already builds as a static export (`next.config.ts` keeps
  `output: 'export'`).
- The desktop shell points at the generated `out/` directory through
  `src-tauri/tauri.conf.json`.
- The local vault, CLI graph engine, and MCP setup gates remain the authority.
- Electron stays a fallback if a later slice needs bundled Node.js behavior.

## Product Quality Bar

The target is not a thin website wrapper. The macOS app should feel credible
next to Obsidian, Claude Desktop, and Codex Desktop:

- native installation with a stable `.app` launch path, dock behavior, window
  sizing, recent vault recall, and clear local permission prompts.
- first-run setup that explains the vault folder, CLI, and MCP handoff without
  sending the user back to hosted docs for the core path.
- local-file confidence: the user can see which vault is open, where data is
  stored, and what will be written before ontology edits touch markdown.
- agent confidence: Claude Code and Codex setup checks remain one click or one
  copied command away, and desktop smoke must include MCP verification.
- offline usefulness: `/docs`, `/ontology`, `/topology`, and `/ontology/edit`
  remain usable from the packaged app against the local vault.

If a prototype cannot meet these standards, keep desktop as an exploration
track instead of shipping a weaker app under the product name.

## Readiness Gate

Run:

```bash
pnpm desktop:check
pnpm desktop:doctor
pnpm build && pnpm desktop:smoke
```

`desktop:check` verifies the static frontend and Tauri scaffold prerequisites
for a macOS prototype:

- Next.js static export is enabled.
- Image optimization is disabled for static packaging.
- trailing-slash routes are emitted for file-backed navigation.
- `pnpm build` refreshes the docs vault before `next build`.
- `docs-vault:check`, `cli:mcp-verify`, `desktop:doctor`, `desktop:dev`,
  `desktop:smoke`, and `desktop:build` are available for packaging, app
  launch, local runtime diagnosis, packaged-route smoke, and agent handoff
  checks.
- `src-tauri/tauri.conf.json` loads `../out`, runs `pnpm build` before
  packaging, and targets a macOS `.app` bundle.
- the Rust entrypoint and default Tauri capability files exist.
- this document keeps the desktop-grade quality bar explicit: native `.app`
  launch, vault-folder permissions, recent vault recall, visible local data
  location, agent setup visibility, and offline route usefulness.
- the first prototype smoke keeps the same route contract explicit: `/docs`,
  `/ontology`, `/topology`, and `/ontology/edit`.

`desktop:doctor` checks the local machine runtime: Tauri CLI, Cargo, rustc, and
macOS Xcode command line tools. It exits successfully as a report by default,
and `pnpm desktop:doctor -- --require-runtime` can be used in a local build
session when missing prerequisites should fail fast.

`desktop:smoke` checks the built `out/` payload that Tauri packages. It verifies
that both `en` and `ko` static routes exist for `/docs`, `/ontology`,
`/topology`, and `/ontology/edit`, that `_next` assets are present, and that the
desktop docs are bundled under `docs-vault/` for offline reference.

## First Prototype Scope

1. Run `pnpm desktop:doctor` and resolve any missing Cargo / rustc / Xcode
   command line tool reports.
2. Run `pnpm install` so `@tauri-apps/cli` is available.
3. Build `out/` with `pnpm build`.
4. Run `pnpm desktop:smoke` to prove the packaged static payload includes the
   desktop routes and offline docs.
5. Launch the macOS app shell with `pnpm desktop:dev`, or build the `.app`
   prototype with `pnpm desktop:build`.
6. Open the dogfood vault and smoke `/docs`, `/ontology`, `/topology`, and
   `/ontology/edit`.
7. Run `pnpm cli:mcp-verify docs/ontology --timeout-ms 15000` after the app
   smoke so the desktop path still proves Claude Code / Codex handoff readiness.

## Later Distribution Work

Treat these as separate hardening slices after the prototype works:

- macOS signing and notarization.
- `.dmg` or `.app` packaging.
- updater and release-channel policy.
- whether MCP/CLI binaries are bundled as sidecars or installed separately.
- filesystem permission UX beyond the current browser File System Access flow.
