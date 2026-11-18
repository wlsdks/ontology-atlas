# Local-first / offline-first principle

> Auto-loaded. The product's largest UX promise: choose one Markdown folder and
> begin, with no server. This is Layer 1; `forbidden.md` owns optional Layer 2.

## Layer 1 promises

1. **Start without a gate.** `pnpm dev` opens a usable first screen; there is no
   login or access check.
2. **Choose a folder and continue.** Point at a Markdown folder and enter the
   topology, tree, and editing workflow immediately. The browser path uses the
   File System Access API.
3. **The answer lives on the user's disk.** Vault frontmatter is the ontology.
   Only the user's files hold it. Beside them Atlas keeps only what it can
   rebuild or ask for again: the vault handle and preferences, and the installed
   app's derived index.
4. **Single-person first.** v0.x is a personal tool.

## Outbound data

- An LLM connection (the user's own API key or a local model) is opt-in only;
  the UI states what leaves the computer and a local audit log records each
  transfer.
- ACP and externally connected MCP agents are a separate provider boundary.
  Distinguish Atlas's local stdio MCP child from the coding agent's provider
  traffic; never claim `.ontology-atlas/llm-audit.jsonl` covers provider-owned
  transfers.
- Never send vault data over HTTP, WebSocket, or another external interface
  without the user's knowledge.

## While writing code

- Ask of every capability: can this work from vault files alone? If it seems to
  need a backend, redesign it as Markdown on the user's disk.
- `src/entities/vault-session/` and `src/features/docs-vault-local/` own
  local-folder access; new work joins them.
- Vault frontmatter is the schema. Do not create a second canonical store.
  IndexedDB may cache the vault handle and preferences, and the installed app
  may keep a derived index (`src-tauri/crates/vault-index`); neither ever wins a
  disagreement with the files on disk.
- A derived index holds only what can be recomputed from vault files: no user
  state, edits, approvals or drafts. A row is used only while its stored stamp
  equals the file's stamp. It lives in the OS cache directory, never in the
  vault or Git, private to the user account, and never leaves the computer. A
  missing, older, newer or damaged index is discarded and rebuilt without a
  prompt. Settings shows its size, deletes it, and can turn it off; with it off
  the app still opens and edits every vault.
- Do not pre-install authentication for a possible future cloud mode.

## Security

- Never scan password, credential, or key files from the user's disk.
  `permissions.deny` in `.claude/settings.json` enforces the read side. Two
  read-only exceptions (`surfaces.md`): agent config names, and the connected
  repository's harness files.
- Skip dotfiles and system directories such as `.env.local` and `.git/` while
  reading a vault.
