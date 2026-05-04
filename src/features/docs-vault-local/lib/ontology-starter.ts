/**
 * mission v2 ontology starter — 5 .md files + .mcp.json scaffolded into an empty folder.
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
5. To see the graph, use the topology / tree / builder views in this web workbench.

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

Once you register the \`oh-my-ontology-mcp\` server, the agent gets 14
tools to read/write this vault:

- **read 8**: list_concepts / get_concept / find_evidence / find_backlinks /
  find_path / list_kinds / find_orphans / query_concepts
- **write 6**: add_concept / add_relation / patch_concept / delete_concept /
  rename_concept / merge_concepts

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
 * MCP config to register an AI agent (Claude Code, Cursor, …). Users
 * copy this into their agent's config. `OMOT_VAULT` must be the
 * absolute path to the vault folder — the browser cannot know it.
 */
export function buildMcpConfigJson(vaultName: string): string {
  return (
    JSON.stringify(
      {
        mcpServers: {
          'oh-my-ontology': {
            command: 'npx',
            args: ['-y', 'oh-my-ontology-mcp'],
            env: {
              OMOT_VAULT: `<absolute path to your ${vaultName} folder>`,
            },
          },
        },
      },
      null,
      2,
    ) + '\n'
  );
}
