---
uid: 4b2f5668-0f0d-4478-9f07-8efa13a80351
slug: elements/installed-mcp-identity-gate
kind: element
title: Installed MCP Identity Gate
domain: domains/agent-integration
path: scripts/deploy-macos-app-local.mjs
created_by: "agent:unknown"
---

## Definition

Installed MCP identity gate is the local delivery check that binds the copied macOS app to the exact built bundle and verifies the bundled MCP still preserves repository source-path case before and after first launch.

## Evidence

- `scripts/lib/macos-app-bundle-identity.mjs`
- `scripts/deploy-macos-app-local.mjs`
- `scripts/verify-mcp-binary.mjs`
- `scripts/sign-macos-app.mjs`
- `scripts/deploy-macos-app-local.test.mjs`
- `scripts/verify-mcp-binary.test.mjs`

## Includes

- Deterministic SHA-256 inventory of every app directory, regular file, and symlink, including mode, file size, and symlink target where applicable.
- Built-versus-installed identity checks immediately after copy and after first launch.
- A generated lowercase-only `readme.md` repository whose compiled, signed, and installed MCP analysis must retain exact lowercase project evidence.

## Excludes

- Developer ID identity, notarization, DMG extraction, updater installation, or cross-architecture proof not executed by the local deployment path.
- Treating tool count, signature validity, or timestamps as substitutes for installed semantic behavior and content identity.

## Uncertainty

The local Apple Silicon path is measured. Credentialed dual-architecture release and updater install/relaunch remain separate release-gate evidence.
