---
uid: dce02204-0454-4a2d-8db3-68d669065489
slug: capabilities/cli-developer-entry
kind: capability
title: CLI Developer Entry
domain: domains/agent-integration
elements: []
path: cli/src
created_by: "agent:unknown"
dependencies: [capabilities/mcp-server]
relation_notes: { capabilities/mcp-server: "The terminal command surface delegates ontology reads, writes, and verification to the same MCP contracts so schema or runtime changes must be checked across both surfaces." }
display: CLI Developer Entry
display_ko: 터미널에서 쓰기
display_en: Terminal Commands
---

# CLI Developer Entry

## Definition

An operational entry point that allows inspecting, querying, and writing local markdown vaults without an app or MCP client, and reproducing agent connections and graph operations in the terminal.

## User Outcomes

- Developers and agents perform new vault creation, verification, semantic queries, relationship analysis, and safe local checkpoints on a single command surface.
- In environments where MCP is not connected, the same compiler/query results and recovery commands are received to continue work.
- `--json` output allows automation to determine state, warnings, and next actions without parsing prose.

## Identity Boundary

- `init`, `add`, `import`, and `bootstrap` issue a lowercase UUIDv4 `uid` for new nodes once. list/find JSON returns `{uid, slug}` together.
- Exact find supports both UID and slug, but relationship/path/URL arguments maintain readable slugs.
- `validate` blocks missing/invalid/duplicate primary keys and merged UIDs as errors,
  while interop export uses `urn:uuid:<uid>` as the external identity.

## Core Flow

1. Prepare local workspace coordinates via `init` or an existing vault's `agent-setup`. `ready` holds only when both the supported launch shape (absolute path to bundled binary or `node` + absolute `mcp/src/index.js`) and the actual target file/vault coordinates match; the retired `npx` setup remains in review.
   `init --quick-start` separates scaffold/config write from bootstrap/MCP verification, leaving only nonzero status, unverified state, and executable diagnose/retry commands on failure, while showing the complete 3-step process only on success.
2. Read status and starting points with `validate`, `overview`, `workspace-brief`, and `agent-brief`.
3. Narrow down necessary nodes, paths, and impacts using `find`, `show`, and graph query commands.
4. Write only approved changes via `add` / `import` / `bootstrap` and explicit apply commands.
   However, `infer-imports --apply` is blocked, and bootstrap/index does not automatically write import endpoints or semantic `depends_on`. Preview lines are marked with `imports`, and imports are review candidates with precise justification, not approved dependencies.
   When import delivery is compact, `bootstrap --json` keeps review-candidate and unresolved totals from the validated scan summary/review queue instead of treating omitted full arrays as zero.
5. Verify connections, impacts, and local Git checkpoints with `mcp-verify`, `preflight`, and `snapshot`.

## Includes

- Vault scaffold, import, and validation on one command surface.
- MCP connection diagnostics, including `agent-setup`, `mcp-verify`, and `preflight`.
- Deterministic compiler output, graph queries, and the agent handoff brief, with `--json` for automation.
- Repository analysis suggestions offered as review candidates, never as approved dependencies.
- Explicit write and apply commands for changes a person approved.
- Vault-scope Git preflight and local snapshot checkpoints.

## Excludes

- npm global distribution; this surface exists only in a source checkout or the installed app.
- Remote backends and any store other than the user's Markdown files.
- Model execution or an agent loop.
- Automatic push, or any Git operation the user did not ask for.
- Semantic generation or storage without user approval, including `infer-imports --apply`.
- Replacement of source-structure search tools such as grep, an AST index, or a language server.

## Implementation Basis

- `cli/src/index.mjs` · `cli/src/lib/cli-commands.mjs`: command dispatcher and registry
- `cli/src/commands/`: individual command implementations
- `cli/src/commands/bootstrap.mjs` · `cli/src/integration.test.mjs`: approval-only bootstrap plan and compact import-count parity
- `cli/src/lib/mcp-call.mjs`: graph command boundary writing structured results like MCP
- `src/shared/config/mcp-server-launch.ts`: determination of two launch shapes shared by app and CLI
- `scripts/smoke-packed-cli.mjs`: end-to-end smoke test viewing quick-start success, injected partial failures' exit codes/messages/runtime import completeness in actual tarball installation environments together
- `cli/README.md`: detailed single source of truth for current commands/options

## Confidence Level

high (0.95): local/integration/packed CLI suite and MCP parity contract verify the same vault
specification and result shapes.
