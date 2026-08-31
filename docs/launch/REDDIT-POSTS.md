# Reddit — launch drafts

Reddit responds best to *honest, problem-first* framing. Each subreddit
has its own norms; copy below tuned per audience.

## r/programming

**Title**: `ontology-atlas — frontmatter as a codebase ontology, AI agents read it via MCP`

**Body** (400~500 words, Reddit allows long-form better than HN):

```markdown
I've been building ontology-atlas to solve a specific problem: AI coding
agents (Claude Code, Cursor, Copilot) treat each conversation as
session-zero. They suggest code, but they don't *understand* the
project's architecture. Existing solutions (Cursor's chats, Claude's
projects) tie that knowledge to one vendor's memory store — your mental
model is locked in.

The hypothesis behind this project: **the mental model belongs in your
git repo, as plain markdown.**

```
my-project/
├── project.md
├── domains/
│   ├── auth.md
│   └── billing.md
├── capabilities/
│   ├── login.md
│   └── checkout.md
└── elements/
    └── jwt-token.md
```

Each `.md` has frontmatter:

```yaml
---
uid: 71890f3e-7b5d-4c0a-8f14-123456789abc
slug: capabilities/login
kind: capability
title: Login
domain: domains/auth
elements:
  - elements/jwt-token
dependencies:
  - capabilities/signup
---
```

That's the entire schema. No DB. The frontmatter *is* the graph. You
can edit it in Obsidian, vscode, neovim — anything that reads markdown.

For AI agents, there's an MCP server (`ontology-atlas-mcp`) over JSON-RPC
stdio. It advertises its current read/write inventory at runtime. The agent gets
`list_concepts`, `get_concept`, `find_path` (BFS), `find_orphans`,
`add_concept`, `patch_concept`, `delete_concept`, etc.

The part I did not expect to care about: **how the server reaches your
machine.** It ships *inside* the macOS app bundle, compiled. Nothing is
published to npm. You download once, open a vault folder, press "Connect
agent", and the app writes the config for you:

```json
{
  "mcpServers": {
    "ontology-atlas": {
      "command": "/Applications/Ontology Atlas.app/Contents/MacOS/ontology-atlas-mcp",
      "args": [],
      "env": { "OATLAS_VAULT": "/path/to/your/vault" }
    }
  }
}
```

It shows you that file before writing it, then spawns the server and
round-trips a real `get_concept` call so the green light means "your
vault is readable", not "a process started". Prefer a terminal? A source
checkout gives you the same CLI and server directly.

The app is also the workbench: a canvas map of the whole vault, a
workshop for filling in a concept's missing relations, and graph
insights. It reads/writes the same `.md` files through a local native
vault bridge; the hosted website is the product intro and download
entry point.

**Pure local-first**: no backend, no auth, no DB, no cloud SDK in the
bundle.

Hosted demo (read-only, dogfood vault, no install): https://ontologyatlas.com/en/topology/
Repo: https://github.com/wlsdks/ontology-atlas
MIT licensed.

**What I'd love criticism on**:

- Is "vault frontmatter = the graph" actually different from glorified
  Obsidian, or am I fooling myself?
- The MCP tools list — what's missing? What's redundant?
- The non-developer angle: would your PMs / designers / domain experts
  actually edit markdown frontmatter? What sucks about that workflow?

Korean + English docs (mixed). Solo project so far. Tear it apart.
```

## r/ChatGPTCoding

**Title**: `Made an MCP server that lets Claude Code read your codebase architecture as a graph (markdown frontmatter)`

**Body** (250 words, focus on AI agent angle):

```markdown
After watching Claude Code re-discover my project's architecture in
every conversation, I built a tiny MCP server that gives it a
*persistent* mental model of the codebase.

The trick: maintain a folder of markdown files where each file is a
"node" (project, domain, capability, element) and frontmatter is the
schema. The MCP server advertises its current tools at runtime: list_concepts, get_concept,
get_concepts, validate_vault, compile_ontology, query_ontology,
analyze_repo_structure, infer_imports, add_concept, add_concepts,
patch_concept, rename_concept, etc.

When I ask Claude "what's the impact of changing auth/login?", it calls
`find_backlinks(slug=capabilities/login)` and returns actual answers
because the dependency graph is *in the repo*, not a vendor silo.

The server ships compiled inside the macOS app — nothing on npm. Open a
vault folder in the app, press "Connect agent", and it writes
`.mcp.json` (Claude Code / Cursor) or `.codex/config.toml` (Codex) after
showing you the file, then boots the server and round-trips a real
`get_concept` call to prove the vault is readable. The config it lands
is this shape:

```json
{
  "mcpServers": {
    "ontology-atlas": {
      "command": "/Applications/Ontology Atlas.app/Contents/MacOS/ontology-atlas-mcp",
      "args": [],
      "env": { "OATLAS_VAULT": "/abs/path/to/my-vault" }
    }
  }
}
```

A source checkout works too if you'd rather run it from a terminal.

There's also a Next.js workbench that renders the same vault as a map you
can explore and edit, if you prefer working visually. But the MCP server is
the part most relevant to AI workflows.

Repo: https://github.com/wlsdks/ontology-atlas
MIT.

What MCP tools would you add? I have read/write covered but I suspect
there are obvious gaps (e.g. semantic search, "describe this region of
the codebase" higher-level queries). Suggestions welcome.
```

## r/LocalLLaMA

**Title**: `Codebase ontology workbench, local-first (no cloud), MCP server for any agent — open source`

**Body** (200 words, focus on local-first / privacy):

```markdown
For folks running local agents and wanting their codebase mental model
to stay local: ontology-atlas is a markdown-based codebase ontology
with a tiny MCP server.

**Local-first**: Vault is just `.md` files in a folder. No cloud, no
account, no backend — period. Static Next.js export so you can run
the visualization offline (it's a `out/` folder you can host or open
file://).

**MCP**: runtime-advertised read/write tools over JSON-RPC stdio. Should work with any MCP-capable
agent (Claude Code, Continue.dev, custom). Doesn't pre-process your
files into embeddings — agent just reads the markdown live.

**Frontmatter is the schema**:

```yaml
---
uid: 71890f3e-7b5d-4c0a-8f14-123456789abc
kind: capability
slug: capabilities/login
title: Login
domain: domains/auth
dependencies: [capabilities/signup]
---
```

The map UI is optional — you can skip it entirely and just use the MCP
server with your local agent.

**Nothing on npm, either.** The server ships compiled inside the macOS
app bundle, and a source checkout runs it straight from `node`. One less
registry in your supply chain, and the config the app writes is plain
text you read in a git diff before it lands.

Repo: https://github.com/wlsdks/ontology-atlas
MIT, unit and E2E suites passing locally.

Built because I didn't want my codebase architecture trapped in a
vendor's memory silo.
```

## Posting tips

- Don't post all three same day — pick one Reddit + HN, wait for
  response. Reddit cross-post detection.
- r/programming is harder; expect 5-10 comments not 50. Quality > volume.
- Reply to every comment within 12 hours of posting. r/programming
  expects engagement.
- Don't link to your own twitter / discord — Reddit auto-flags self-promo
- Mention you're solo + open to PRs to soften "show off" tone
