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

The first slice is a feasibility proof, not a second product architecture:
wrap the existing Next.js static export in a Tauri shell, open the same local
vault folder, render `/docs`, `/ontology`, `/topology`, and `/ontology/edit`,
then verify the same CLI/MCP setup gates still work for Claude Code and Codex.
`pnpm desktop:check` is the pre-scaffold gate for that slice: it checks the
Next.js static export shape, static image mode, trailing-slash routes, docs-vault
build freshness path, and CLI/MCP verification script availability.

This keeps the desktop app aligned with the core ontology definition: the
frontmatter graph remains the source of truth, the CLI/MCP graph engine remains
the agent interface, and the app is only a native-feeling local shell for the
workbench.

Distribution hardening is a later slice: signing, notarization, updater,
packaged MCP/CLI sidecars, and release-channel policy should be handled only
after the local macOS prototype proves that the existing vault workflow works
without the hosted site.
