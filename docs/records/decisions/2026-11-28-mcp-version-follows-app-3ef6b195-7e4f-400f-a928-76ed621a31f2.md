---
id: 3ef6b195-7e4f-400f-a928-76ed621a31f2
date: 2026-11-28
---
## 2026-11-28 — The MCP server carries the app's version

**Why**: measured 2026-11-28, `mcp/package.json` had said 0.13.0 since #548, before v1.0.0, so every release shipped `ontology-atlas-mcp-0.13.0.mcpb` with different contents. `publish-mcp-registry.yml` skips a version the registry already lists, and the registry treats a version as immutable, so `io.github.wlsdks/ontology-atlas` still pointed at the v1.2.0 bundle. Registry installs lacked the v2.7.14 `gpg.program` fix (#4007) and everything since v1.2.0.
**Prior**: extends 2026-09-11 "Atlas enters the MCP ecosystem as a release bundle", which made the bundle a release asset but left its version to a hand bump nobody made.
**Decision**: from v2.7.15 the MCP server version equals the desktop app version. `pnpm desktop:release-tag` holds `mcp/package.json` to the tag beside package, Tauri and Cargo, and the release rehearsal compares the same four files; `server-version.mjs` stays pinned to `mcp/package.json` by its contract test. 0.13.0 to 2.7.15 only increases, so the registry accepts it.
**Dissent**: the MCP contract deserves its own semver, so a client can tell a breaking tool change from an app release that left the server untouched. Not adopted: one version the release check enforces beats a second one nobody bumped since v1.0.0; a breaking tool change is named in its change record instead.
**Falsifier**: a release ships an MCP server whose version differs from the app's, or the registry lists a version older than the latest release.
**Owner**: stark (lead decision, 2026-11-28)
