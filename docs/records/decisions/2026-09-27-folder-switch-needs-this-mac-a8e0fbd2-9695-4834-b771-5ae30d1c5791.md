---
id: a8e0fbd2-9695-4834-b771-5ae30d1c5791
date: 2026-09-27
---
## 2026-09-27 — A folder's switch runs nothing on a Mac that has not allowed it

**Why**: security review: settings that travel with a folder could turn on what runs on this computer, and consent to run something belongs to the computer, not to the folder.
**Prior**: upholds and narrows 2026-09-05 "A person attaches external MCP servers to the in-app agent" (default off) and the 2026-09-17 rounds standing scope; keeps `local-first.md`, since the new store only restricts.
**Decision**: a connector attaches, and a round runs by clock or "Run now", only when the folder has it on and this Mac allowed its exact definition (`connectorFingerprint`, `roundFingerprint`), kept in WebView localStorage by absolute folder path; missing or corrupt means not allowed. Switching on, resuming or saving here allows; pausing keeps it; removing forgets it. Waiting items show their whole line and one press; after the upgrade every item waits for one press. A keychain reference that is not the connector's own leaves it out (`secret-ref-foreign`).
**Dissent**: the fingerprint also covers names and non-secret values, so a collaborator's `NOTION_VERSION` edit asks again; accepted, since `NODE_OPTIONS` or a base address changes what runs. Rust enforcement at `acp_send` needs a command in `lib.rs`, owned elsewhere this round; open.
**Falsifier**: a connector attaching or a pass starting for a definition this Mac never allowed; or an allowed, unchanged item that stops.
**Owner**: Stark (proposed in the pull request that lands it; landing it accepts this record)
