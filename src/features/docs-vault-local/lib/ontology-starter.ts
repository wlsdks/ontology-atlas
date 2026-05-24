/**
 * mission v2 ontology starter — 5 .md files + agent MCP configs scaffolded into an empty folder.
 *
 * Mirrors cli/templates/vault/. Keep both in sync so the CLI and the web
 * workbench produce the same starter files.
 */

interface StarterFile {
  /** Relative path inside the vault (e.g. README.md, domains/example.md). */
  relPath: string;
  content: string;
}

const README_MD = `---
slug: README
kind: vault-readme
title: My ontology vault
---

# My ontology vault

This folder is **a codebase mental model that humans and AI agents grow
together**. Every \`.md\` file is one node (project / domain / capability /
element / concept), and the frontmatter at the top of each file is the
graph's keys (slug / kind / depends_on / capabilities / elements / domain).

## Get started in 5 minutes

1. Open \`project.md\` and write your project's name and description.
2. When a new domain comes to mind, add \`<slug>.md\` under \`domains/\`:
   \`\`\`markdown
   ---
   slug: domains/auth
   kind: domain
   title: Authentication
   capabilities:
     - capabilities/login
     - capabilities/signup
   ---

   Owns user authentication, sessions, and permissions.
   \`\`\`
3. Same pattern for capability and element — under \`capabilities/\` and \`elements/\`.
4. Register an AI agent (Claude Code, Cursor, …) and it reads/writes the
   same vault, growing it alongside you.
5. To see the graph, open the workbench's \`/docs\` picker and point it at
   this vault folder.

Prefer an automatic first graph? From your codebase root:

\`\`\`bash
oh-my-ontology bootstrap . --vault <this-folder>
\`\`\`

The command analyzes \`package.json\`, README headings, and \`src/\` layout,
then replaces untouched starter examples with real project/domain/capability
nodes. If you edited a starter file, it is preserved.

## AI agent setup

If this vault came from \`oh-my-ontology init\` or the web workbench starter,
the vault folder already has:

- \`.mcp.json\` for Claude Code / Cursor
- \`.codex/config.toml\` for Codex

Open the vault folder itself in the agent and restart it. Both config files use
\`OMOT_VAULT=.\`, so the agent reads and writes this folder directly.

If you prefer to keep the agent opened at a separate codebase root, use the
manual template instead: open \`.mcp.json.example\`, replace the
\`OMOT_VAULT\` placeholder with the absolute path to this vault, then copy that
server entry into your agent config.

Codex can also be wired globally with one command:

  \`\`\`bash
  codex mcp add oh-my-ontology --env OMOT_VAULT=/absolute/path/to/this-vault -- npx -y oh-my-ontology-mcp
  \`\`\`

## Verify the agent loop

After restarting the agent, ask it to prove the connection before it edits
anything:

> Use the oh-my-ontology MCP server to run \`validate_vault\`, then
> \`query_ontology({ "operation": "workspace_brief" })\`, then
> \`query_ontology({ "operation": "agent_brief" })\`. Tell me whether this
> vault is readable and the write tools are available before proposing changes.

If the CLI is installed, the same first-contact check is:

\`\`\`bash
oh-my-ontology validate .
oh-my-ontology workspace-brief .
oh-my-ontology agent-brief . --prompt
oh-my-ontology agent-brief . --graph-db-pack
oh-my-ontology agent-brief . --verify-fallbacks
oh-my-ontology mcp-verify . --timeout-ms 15000
\`\`\`

For automation that wants a small JSON report instead of human terminal output:

\`\`\`bash
oh-my-ontology agent-brief . --verify-fallbacks --json --fallback-timeout-ms 15000
\`\`\`

For an agent opened at your codebase root instead of this vault folder, replace
\`.\` with the vault path, for example \`./ontology\`.

## Relations (frontmatter keys)

| Key | What it expresses |
|---|---|
| \`depends_on: [<slug>, ...]\` | This node depends on other nodes |
| \`capabilities: [...]\` | Capabilities this domain / project provides |
| \`elements: [...]\` | Elements this capability / domain uses |
| \`domain: <slug>\` | Parent domain of this capability/element |
| \`relates: [...]\` | Loose related-to references |

## Kinds

- \`project\` — Top-level. Usually one per workspace.
- \`domain\` — A large area (auth, billing, builder, …).
- \`capability\` — A user-visible feature inside a domain (login, signup, …).
- \`element\` — A smaller unit a capability uses (jwt-token, otp-store, …).
- \`document\` — Evidence node (markdown doc backing other concepts).

## What an AI agent can do for you

Once you register the \`oh-my-ontology-mcp\` server, the agent gets 23
tools to read/write this vault:

- **read 15**: list_concepts / get_concept / get_concepts / find_evidence /
  find_backlinks / find_neighbors / find_path / list_kinds / find_orphans /
  query_concepts / compile_ontology / query_ontology / validate_vault /
  analyze_repo_structure / infer_imports
- **write 8**: add_concept / add_concepts / add_relation / add_relations /
  patch_concept / delete_concept / rename_concept / merge_concepts

Details: https://github.com/wlsdks/oh-my-ontology/tree/main/mcp
`;

const PROJECT_MD = `---
slug: project
kind: project
title: My project
domains:
  - domains/example
capabilities:
  - capabilities/example
elements:
  - elements/example
---

# My project

Write a one- or two-line summary of your project here — *what / for whom / why*.

## One-line mission

The problem this project solves, or the value it creates, in a single sentence.

## How it grows

- Fill in \`domains: [...]\` in the frontmatter and the domain nodes hang
  off your project tree automatically.
- Each domain's capabilities and elements follow the same pattern.
- When an AI agent adds a new node, this file's \`depends_on\` / \`domains\`
  may auto-update — frontmatter is the source of truth, so there are no
  conflicts.

## Next steps

1. Edit this file's \`title\` (and any other frontmatter besides \`kind: project\`)
   to match your project.
2. Rename or copy starters like \`domains/example.md\` into your real domains.
3. Register an AI agent (Claude Code, Cursor, …) and ask it to "tidy up
   the ontology in this vault."
`;

const DOMAIN_MD = `---
slug: domains/example
kind: domain
title: Example domain
capabilities:
  - capabilities/example
---

# Example domain

A *domain* is a large area of your project (subsystems like auth,
billing, builder, realtime, search). Rename this file to match one of
your real domains (\`domains/auth.md\`, \`domains/billing.md\`, …) and list
the capabilities it owns under \`capabilities:\` in the frontmatter above.

## How to fill it in

- Use one or two paragraphs of body text to describe *what this domain is*.
- Markdown links to other domains / capabilities in the body register as
  backlinks automatically.
- Frontmatter keys:
  - \`capabilities: [...]\` — slugs of capabilities this domain owns
  - \`depends_on: [...]\` — other domains or external systems this depends on
  - \`relates: [...]\` — loose related-to references (optional)

## Keep it or delete it?

- Keep it: fill it in following the guide above.
- Don't need it: just delete this file — it's only a starter.
`;

const CAPABILITY_MD = `---
slug: capabilities/example
kind: capability
title: Example capability
domain: domains/example
elements:
  - elements/example
---

# Example capability

A *capability* is one user-visible feature within a domain (login,
signup, checkout, search, builder canvas, …). Rename this file to match
one of your real capabilities (\`capabilities/login.md\`,
\`capabilities/checkout.md\`) and update the \`domain:\` and \`elements:\`
keys above accordingly.

## How to fill it in

- In the body, describe *what this capability does* and one or two user
  scenarios.
- Frontmatter keys:
  - \`domain: <slug>\` — the single parent domain
  - \`elements: [...]\` — slugs of elements this capability uses
  - \`depends_on: [...]\` — other capabilities this depends on
  - \`relates: [...]\` — loose related-to references (optional)
`;

const ELEMENT_MD = `---
slug: elements/example
kind: element
title: Example element
domain: domains/example
---

# Example element

An *element* is a smaller unit a capability uses (jwt-token, otp-store,
indexeddb-adapter, sigma-canvas, …). Rename this file to match a real
element (\`elements/jwt-token.md\`) and set \`domain:\` to the right parent.

## How to fill it in

- One or two paragraphs in the body covering *what / why / which interface*.
- Frontmatter keys:
  - \`domain: <slug>\` — the single parent domain
  - \`path: <src/...>\` — code path this element corresponds to (optional)
  - \`depends_on: [...]\` — other elements / capabilities this depends on
  - \`relates: [...]\` — loose related-to references (optional)
`;

export const ONTOLOGY_STARTER_FILES: ReadonlyArray<StarterFile> = [
  { relPath: 'README.md', content: README_MD },
  { relPath: 'project.md', content: PROJECT_MD },
  { relPath: 'domains/example.md', content: DOMAIN_MD },
  { relPath: 'capabilities/example.md', content: CAPABILITY_MD },
  { relPath: 'elements/example.md', content: ELEMENT_MD },
];

/**
 * MCP config template to register an AI agent (Claude Code, Cursor, …) from
 * a different working directory. `OMOT_VAULT` must be the absolute path to
 * the vault folder — the browser cannot know it.
 */
export function buildMcpConfigJson(vaultName: string): string {
  return buildMcpConfigJsonForVault(`<absolute path to your ${vaultName} folder>`);
}

/**
 * Ready-to-use MCP config for opening the vault folder itself in Claude Code
 * or Cursor. `OMOT_VAULT=.` keeps the config portable inside the folder.
 */
export function buildVaultMcpConfigJson(): string {
  return buildMcpConfigJsonForVault('.');
}

function buildMcpConfigJsonForVault(omotVault: string): string {
  return (
    JSON.stringify(
      {
        mcpServers: {
          'oh-my-ontology': {
            command: 'npx',
            args: ['-y', 'oh-my-ontology-mcp'],
            env: {
              OMOT_VAULT: omotVault,
            },
          },
        },
      },
      null,
      2,
    ) + '\n'
  );
}

/**
 * Codex MCP config. Defaults to the vault folder itself, but can also render
 * the codebase-root template where `OMOT_VAULT` must be an absolute path.
 */
export function buildCodexConfigToml(omotVault = '.'): string {
  return [
    '[mcp_servers.oh-my-ontology]',
    'command = "npx"',
    'args = ["-y", "oh-my-ontology-mcp"]',
    '',
    '[mcp_servers.oh-my-ontology.env]',
    `OMOT_VAULT = ${JSON.stringify(omotVault)}`,
    '',
  ].join('\n');
}

export function buildCodexConfigTomlTemplate(vaultName: string): string {
  return buildCodexConfigToml(`<absolute path to your ${vaultName} folder>`);
}

/**
 * One-line Codex CLI registration for users who prefer mutating their Codex
 * MCP config through the CLI instead of editing `.codex/config.toml`.
 */
export function buildCodexMcpAddCommandTemplate(vaultName: string): string {
  const vaultPath = `<absolute path to your ${vaultName} folder>`;
  return [
    'codex',
    'mcp',
    'add',
    'oh-my-ontology',
    '--env',
    `OMOT_VAULT=${shellQuote(vaultPath)}`,
    '--',
    'npx',
    '-y',
    'oh-my-ontology-mcp',
  ].join(' ');
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}
