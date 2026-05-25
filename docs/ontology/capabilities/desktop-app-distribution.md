---
slug: desktop-app-distribution
kind: capability
title: macOS Desktop App Distribution
domain: vault-local-first
dependencies:
  - capabilities/agent-config-onboarding
  - capabilities/frontmatter-to-ontology
  - capabilities/vault-live-updates
relates:
  - domains/ai-agent-partner
  - domains/views
---

`oh-my-ontology` should explore a macOS-first desktop app as a local install
path over the same markdown vault.

The quality bar is Obsidian / Claude Desktop / Codex Desktop class: a stable
native `.app`, trustworthy vault-folder permission UX, recent vault recall,
clear local data location, offline operation, and visible Claude Code / Codex
handoff checks. A thin hosted-site wrapper is not enough; if the desktop shell
cannot make the local ontology workflow feel first-class, it should remain an
internal prototype.

The first slice is a feasibility proof, not a second product architecture:
wrap the existing Next.js static export in a Tauri shell, open the same local
vault folder, render `/docs`, `/ontology`, `/topology`, and `/ontology/edit`,
then verify the same CLI/MCP setup gates still work for Claude Code and Codex.
The repository now has the first `src-tauri/` shell with `frontendDist: "../out"`
and macOS `.app` bundle targeting. `pnpm desktop:check` is the scaffold-aware
gate for that slice: it checks the Next.js static export shape, static image
mode, trailing-slash routes, docs-vault build freshness path, CLI/MCP
verification script availability, `desktop:dev` / `desktop:smoke` /
`desktop:build` scripts, the Tauri shell files, the explicit desktop-grade
quality bar, and the first prototype route-smoke scope. `pnpm desktop:smoke`
checks the built `out/` payload that the `.app` packages: locale-prefixed
`/docs`, `/ontology`, `/topology`, and `/ontology/edit` routes, `_next` assets,
and offline desktop docs under `docs-vault/`. `pnpm desktop:doctor` is the local
machine and ontology-handoff diagnosis for that same track: it reports Tauri
CLI, Cargo, rustc, macOS Xcode command line tool readiness, the dogfood
`docs/ontology` vault, the `cli:mcp-verify` handoff gate, and offline desktop
docs before a user attempts `.app` builds.
`pnpm checks:changed` also routes desktop-related edits to this gate, and routes
checker, doctor, and smoke implementation edits through focused
`pnpm exec node --test scripts/check-desktop-readiness.test.mjs` and
`pnpm exec node --test scripts/desktop-doctor.test.mjs` /
`pnpm exec node --test scripts/desktop-smoke.test.mjs` contracts first.

This keeps the desktop app aligned with the core ontology definition: the
frontmatter graph remains the source of truth, the CLI/MCP graph engine remains
the agent interface, and the app is only a native-feeling local shell for the
workbench.

Distribution hardening is a later slice: signing, notarization, updater,
packaged MCP/CLI sidecars, and release-channel policy should be handled only
after the local macOS prototype proves that the existing vault workflow works
without the hosted site.
