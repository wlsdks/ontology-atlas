# Local-first / offline-first principle

> Auto-loaded. This is the product's largest UX promise: like Obsidian, choose
> one Markdown folder and begin. No server is required.

## Two layers (v9, 2026-07-17)

This document is the inviolable promise of **Layer 1**, the local core on the
user's computer. `forbidden.md` owns optional Layer 2 and the six trust promises
it must satisfy. An LLM connection—the user's own API key or a local model—
is allowed only on opt-in, with the UI stating what leaves the computer and a
local audit log recording each transfer.

ACP and externally connected MCP agents are a separate provider boundary. Atlas
must distinguish its local stdio MCP child from the coding agent's provider
traffic and must not claim that `.ontology-atlas/llm-audit.jsonl` covers
provider-owned transfers.

## Layer 1 promises (R10)

1. **Start without a gate.** `pnpm dev` opens a usable first screen. R10 removed
   login and access checks entirely.
2. **Choose a folder and continue.** Point at a Markdown folder on disk and enter
   the topology, tree, and editing workflow immediately. The browser path uses
   the File System Access API (`src/entities/vault-session/`).
3. **The answer lives on the user's disk.** Vault frontmatter is the ontology.
   There is no server database, Firestore, or cloud store. Only the user's files
   and the browser's IndexedDB hold data.
4. **Single-person first.** v0.x is a personal tool.

## While writing code

- Ask of every capability: can this work from vault files alone? If it seems to
  need a backend, redesign it as Markdown on the user's disk.
- `src/entities/vault-session/` and `src/features/docs-vault-local/` (entry
  UI) own local-folder access; new work joins them.

## Data shape

- Vault frontmatter is the schema. Do not create a second canonical store or
  collection.
- IndexedDB may cache the vault handle and preferences. It never wins a
  disagreement with the files on disk.
- Prefer simple shapes; cross-vault relations belong to a later phase.

## Login

- No login route exists. R10 removed those routes and `@/features/user-auth`,
  `@/features/permissions`, and `@/features/account-scope` with them.
- If cloud collaboration opens later, design its authentication then. Never
  pre-install it.

## Security

- Never scan password, credential, or key files from the user's disk.
  `permissions.deny` in `.claude/settings.json` enforces the read side; it needs
  no path to resolve and outranks every hook. One written exception
  (`surfaces.md` table): agent config files, read-only, names not values.
- Skip dotfiles and system directories such as `.env.local` and `.git/` while
  reading a vault.
- Never send vault data over HTTP, WebSocket, or another external interface
  without the user's knowledge.
