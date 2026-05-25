# macOS Desktop App Track

`oh-my-ontology` can become a macOS-installed app without changing the source of
truth. The desktop app should be a native shell around the same local markdown
vault, not a backend, cloud sync layer, or second data store.

## Current Decision

Use Tauri first for the prototype.

- The web app already builds as a static export (`next.config.ts` keeps
  `output: 'export'`).
- The desktop shell can point at the generated `out/` directory.
- The local vault, CLI graph engine, and MCP setup gates remain the authority.
- Electron stays a fallback if a later slice needs bundled Node.js behavior.

## Readiness Gate

Run:

```bash
pnpm desktop:check
```

The gate verifies the static frontend prerequisites for a macOS/Tauri prototype:

- Next.js static export is enabled.
- Image optimization is disabled for static packaging.
- trailing-slash routes are emitted for file-backed navigation.
- `pnpm build` refreshes the docs vault before `next build`.
- `docs-vault:check` and `cli:mcp-verify` are available for packaging and agent
  handoff checks.

## First Prototype Scope

1. Add `src-tauri/tauri.conf.json` with `frontendDist: "../out"`.
2. Build `out/` with `pnpm build`.
3. Launch the macOS app shell against the static export.
4. Open the dogfood vault and smoke `/docs`, `/ontology`, `/topology`, and
   `/ontology/edit`.
5. Run `pnpm cli:mcp-verify docs/ontology --timeout-ms 15000` after the app
   smoke so the desktop path still proves Claude Code / Codex handoff readiness.

## Later Distribution Work

Treat these as separate hardening slices after the prototype works:

- macOS signing and notarization.
- `.dmg` or `.app` packaging.
- updater and release-channel policy.
- whether MCP/CLI binaries are bundled as sidecars or installed separately.
- filesystem permission UX beyond the current browser File System Access flow.
