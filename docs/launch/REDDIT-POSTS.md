# Reddit — launch drafts

Reddit responds best to *honest, problem-first* framing. Each subreddit
has its own norms; copy below tuned per audience.

## r/programming

**Title**: `oh-my-ontology — frontmatter as a codebase ontology, AI agents read it via MCP`

**Body** (400~500 words, Reddit allows long-form better than HN):

```markdown
I've been building oh-my-ontology to solve a specific problem: AI coding
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
slug: capabilities/login
kind: capability
domain: domains/auth
elements:
  - elements/jwt-token
depends_on:
  - capabilities/signup
---
```

That's the entire schema. No DB. The frontmatter *is* the graph. You
can edit it in Obsidian, vscode, neovim — anything that reads markdown.

For AI agents, there's an MCP server (`oh-my-ontology-mcp`, 11 tools
read+write) over JSON-RPC stdio. Register it in Claude Code's
`.mcp.json`:

```json
{
  "mcpServers": {
    "oh-my-ontology": {
      "command": "npx",
      "args": ["-y", "oh-my-ontology-mcp"],
      "env": { "OMOT_VAULT": "/path/to/your/vault" }
    }
  }
}
```

The agent now has `list_concepts`, `get_concept`, `find_path` (BFS),
`find_orphans`, `add_concept`, `patch_concept`, `delete_concept`, etc.

There's also a Next.js workbench that visualizes the same vault three
ways: Sigma WebGL topology, hierarchical tree, xyflow ERD builder. All
read/write the same `.md` files via the browser File System Access API.
Static export — works offline, no server.

**Local-first first paint promise**: I went deep on making firebase JS
not load on local-first routes. There's a `pnpm bundle:check` script
that verifies user-facing routes contain 0 KB of Firebase. CI guard
against regression.

30-second try:

```bash
npx oh-my-ontology init my-vault
cd my-vault
$EDITOR project.md
```

Hosted demo (read-only, dogfood vault): https://oh-my-ontology.web.app
Repo: https://github.com/wlsdks/oh-my-ontology
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
schema. The MCP server has 11 tools — list_concepts, get_concept,
find_path (BFS), find_orphans, add_concept, patch_concept, etc.

When I ask Claude "what's the impact of changing auth/login?", it calls
`find_backlinks(slug=capabilities/login)` and returns actual answers
because the dependency graph is *in the repo*, not a vendor silo.

```bash
npx oh-my-ontology init my-vault   # scaffold a vault
# then add this to ~/.config/claude-code/mcp.json:
{
  "mcpServers": {
    "oh-my-ontology": {
      "command": "npx",
      "args": ["-y", "oh-my-ontology-mcp"],
      "env": { "OMOT_VAULT": "/abs/path/to/my-vault" }
    }
  }
}
```

There's also a Next.js workbench that renders the same vault as a
graph, tree, and ERD builder if you prefer visual editing. But the MCP
server is the part most relevant to AI workflows.

Repo: https://github.com/wlsdks/oh-my-ontology
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
to stay local: oh-my-ontology is a markdown-based codebase ontology
with a tiny MCP server.

**Local-first**: Vault is just `.md` files in a folder. No cloud, no
account, no Firebase by default. Static Next.js export so you can run
the visualization offline (it's a `out/` folder you can host or open
file://).

**MCP**: 11 tools, JSON-RPC stdio. Should work with any MCP-capable
agent (Claude Code, Continue.dev, custom). Doesn't pre-process your
files into embeddings — agent just reads the markdown live.

**Frontmatter is the schema**:

```yaml
---
kind: capability
domain: domains/auth
depends_on: [capabilities/signup]
---
```

Three views: Sigma topology, tree, xyflow ERD. All optional — you can
skip the UI entirely and just use the MCP server with your local agent.

```
npx oh-my-ontology init my-vault
```

Repo: https://github.com/wlsdks/oh-my-ontology
MIT, 100 test files / 721 tests passing.

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
