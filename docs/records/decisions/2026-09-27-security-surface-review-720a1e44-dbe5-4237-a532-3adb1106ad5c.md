---
id: 720a1e44-dbe5-4237-a532-3adb1106ad5c
date: 2026-09-27
---
## 2026-09-27 — A change on a security surface gets the security lens

**Why**: owner, 2026-09-27: verify security so that no issue ships. A change to the MCP server, a Tauri command or bridge, a raw-HTML sink, a release script or a workflow could land without the security contracts running or anyone reading it for untrusted input.
**Prior**: extends 2026-09-27 "One independent reviewer replaces the PO and design councils": `po:route` still asks for a reviewer only when it returns review; this adds one trigger, a security surface, raised by `pnpm checks:changed`.
**Decision**: `scripts/lib/check-rules/security.mjs` lists the security surfaces; a change on one runs `pnpm test:security`, and one on the reach tier lands only after one `reviewer` applies the `security` lens; a new raw-HTML or `window.open` sink needs a visible ratchet raise; `/security-audit` sweeps four areas before each release.
**Dissent**: one max-effort review per reach-tier change is costly: 58 of 264 first-parent commits in the preceding 14 days (22%) touched it, mostly `mcp/src`, `src-tauri` and the TypeScript bridges. Accepted because most were delegated slices that are reviewed anyway.
**Falsifier**: narrow the tier if a month of `security`-lens reviews finds nothing; a `/security-audit` finding on a surface whose change passed a `security`-lens review means the lens is too weak.
**Owner**: Stark
