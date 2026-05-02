# PRODUCT DIRECTION — Ontology workbench (humans + AI agents co-author)

> Written (v2): 2026-05-01
> Decisions captured: the user confirmed **Direction A** (ontology-first) and added **dogfooding + AI-agent partnership** as a new direction.
> This file overlays v2 on top of v1's strategic diagnosis (left in place); **the decisions and the new direction** below are what's current.

---

## TL;DR — first principle in one line (v2)

> **This project is an ontology workbench — non-developers and AI agents co-author the mental model of one codebase.**

- Topology = one of the *exits* (a view), not the spine.
- Spine = `.md` documents → a growing ontology.
- Non-developers (PM · designer · ops) get a surface that's friendlier than ERDs.
- AI agents (Claude Code, …) read and write the same ontology — that *partner* angle is what differentiates us from generic ontology tools.

---

## 1. User decisions, summary

### Decision 1 — Direction A (ontology-first)

`/` becomes the **ontology hub**:

- First load: tree + ego graph (lifting today's `/ontology` core to the root).
- Topology becomes a sub-view — `/topology` or `/?view=topology`.
- Users immediately understand "this is where I organize my domain knowledge."

User quote:

> "It's an ontology service, right? Especially this one — it's meant for non-developers, beyond an ERD, isn't it?"

### Decision 2 — Self-hosting + AI-agent collaboration

Key insight (user):

> "What if we build the service while using the service ourselves? Make a local package, run it offline, fill it in and review continuously, and have the ontology service itself help the AI agent that's developing it?"

What this decodes to:

1. **Dogfooding** — use this project's own `docs/` as the vault for this service.
2. **Local package** — installable on the user's disk, runs offline (no Firebase needed).
3. **AI agent as partner** — Claude Code (which already reads source) should also be able to read and write the ontology.

This is the differentiator. **Generic ontology workbench (Protégé etc.) → "where AI and humans co-author a codebase mental model."**

---

## 2. Two audiences, one ontology

| Audience | What they do with this service |
|---|---|
| **Developers** | Map code ↔ concepts — "which service implements this capability?" |
| **PM / designer / ops** | Build a mental model without reading source — "which domain, which elements" |
| **AI agents** (Claude Code, …) | Codebase prior knowledge — answer "what does 'auth' mean in this project?" |

The new mission claims one ontology can satisfy all three.

---

## 3. AI-agent collaboration — what it concretely means

### 3-A. Read path (already works)

When an AI agent reads vault files (`projects/*.md`), the frontmatter directly expresses the ontology:

```yaml
---
slug: auth-platform
kind: project
domain: Authentication
capabilities:
  - Token issue
  - Permission check
  - Session tracking
elements: [JWT, Postgres, refresh-token]
dependencies: [user-service, audit-trail]
---

# Auth Platform

Owns user authentication, sessions, and permissions in one place ...
```

Frontmatter alone auto-stubs capabilities + elements + edges (already implemented). When an AI agent reads this vault, it gets the mental model immediately.

### 3-B. Write path (needed)

While analyzing code, the AI agent commits newly discovered facts to the ontology:

```bash
# example: after the agent inspects a file
$ ohmy add element src/features/billing/lib/cycle-rule.ts \
    --kind element \
    --capability "Subscription cycle calculation" \
    --project billing-service
```

Options:

1. **CLI** — `npx oh-my-ontology add ...` (auto-writes frontmatter)
2. **MCP server** — Claude Code calls tools directly (`mcp__oh-my-ontology__add_node`)
3. **Programmatic API** — `import { addNode }` from the package

Most ergonomic: **option 3 (MCP server)**. The agent navigates the codebase and adds discovered concepts to the ontology *directly*. Humans review them in the builder.

### 3-C. Two-way sync

```
human edits builder canvas
        │
        ▼
ontology graph (vault frontmatter)
        ▲
        │
AI agent reads codebase → adds nodes via MCP/CLI
```

Same graph. Same vault. Different input paths.

---

## 4. Local package — how to distribute

### Option A — npm package + CLI

```bash
# user, from any project root
$ npx oh-my-ontology@latest

# starts:
# - treats the current directory as the vault
# - serves the web UI on localhost:3210
# - opens the browser
# - if Firebase isn't configured, falls back to local mode automatically
```

Pros:

- Zero install friction (just `npm` / `pnpm`).
- Any project becomes a potential vault.
- Offline-first by default.
- Next.js build output ships as-is (static export + tiny server).

Cons:

- Requires Node.js.
- Bundle is heavy after publish (Sigma + xyflow + …).

### Option B — Electron desktop app

Pros: feels truly native.
Cons: complex build, heavy distribution, mismatched with the "AI agent shares this" concept (CLI fits better).

### Option C — Just Next.js static export + a guide

Use after `pnpm dev`. No packaging. Document with environment variables.

Pros: fastest. Zero new deps.
Cons: blocks distribution (clone overhead).

### Recommendation: option A

Publish `oh-my-ontology` as an npm package. Users run `npx oh-my-ontology` from any project root. AI agents participate via the same package's MCP server or CLI.

---

## 5. The agent-as-partner surface

### 5-A. MCP server

Separate package, `oh-my-ontology-mcp`. Claude Code-compatible:

```json
// .mcp.json or settings
{
  "mcpServers": {
    "oh-my-ontology": {
      "command": "npx",
      "args": ["-y", "oh-my-ontology-mcp"],
      "env": { "OMOT_VAULT": "./" }
    }
  }
}
```

Tools (11 — read 7 + write 4):

- read: `list_concepts` (every node, filter by kind), `get_concept` (single node + neighbors), `find_evidence` (which code grounds this concept), `find_backlinks`, `find_path` (shortest-path BFS), `list_kinds` (kind distribution), `find_orphans` (no-edge nodes)
- write: `add_concept`, `add_relation`, `patch_concept`, `delete_concept`

With this in place, the agent can answer **"which concept is this file an element of?"** directly during code exploration. No re-inferring every conversation.

### 5-B. Auto-generated ontology index in AGENTS.md / CLAUDE.md

At build time, dump the ontology's high-level structure as markdown:

```markdown
# This project's ontology (auto-generated)

## Domains
- Authentication: Token issue · Permission check · Session tracking
- Billing: Subscription · Usage · Invoicing

## Capabilities
- Token issue [auth-platform/iam-core]
- ...
```

When an agent enters the codebase, it sees this on the first page and picks up the mental model instantly.

---

## 6. Phases — broken into executable steps

### ✅ Phase 1 — Identity alignment (UI) — merged

1. ✅ `/` becomes the ontology hub
2. ✅ New `/topology` route
3. ✅ Landing copy — "Codebase ontology that grows with AI"
4. ✅ Slim demo — 21 → 6 containers, ~50 flat projects, ~42 ontology nodes

### ⏸ Phase 2 — Self-hosting — DEFERRED

`bin` + CLI packaging. **Per user policy, Firebase deploy is on hold** and `pnpm dev` covers verification → DEFERRED. Revisit later.

### ✅ Phase 3 — AI agent partner — merged

1. ✅ `mcp/` package — MCP server v0.5.0 (`oh-my-ontology-mcp`)
2. ✅ 12 tools (read 8 + write 4): `list_concepts` / `get_concept` / `find_evidence` / `find_backlinks` / `find_path` / `list_kinds` / `find_orphans` / `query_concepts` (typed filter DSL) / `add_concept` / `add_relation` / `patch_concept` / `delete_concept`
3. ✅ CLI command (`oh-my-ontology`) — `npx oh-my-ontology init <folder>` scaffolds the vault. The web `/docs` "Create starter seed" button is the no-terminal alternative.
4. ⏸ Auto-generated AGENTS.md — DEFERRED (manual updates + dogfood vault cover this)
5. ✅ `docs/ontology/` dogfood vault — ~23 nodes describing our own mental model

### ⏳ Phase 4 — Polish for non-developers — upcoming

Details: `docs/BACKLOG.md` T33-T36.

1. ⏳ Builder onboarding copy aligned with "more than an ERD — a domain map"
2. ⏳ Mapping layer between technical jargon and everyday language
3. ⏳ Per-kind node colors / icons (more familiar)
4. ⏳ Search results categorized by "code / doc / person" (PM-friendly)

---

## 7. Old vs. new mission

### Old mission (per AGENTS.md, current)

> The user writes prose; the system extracts concepts, relations, evidence; humans review and approve; the result grows into three views (topology, tree, ERD).

### New mission (proposed in this doc)

> **An ontology of one codebase, co-authored by humans and AI agents.**
>
> - Humans: add nodes/edges directly from the vault frontmatter or the builder canvas.
> - AI agents (Claude Code, …): commit code-exploration findings to the ontology via MCP or CLI.
> - All inputs share one vault graph. All views (tree hub / topology sub-view / ERD).
> - Distributed as a package — `npx oh-my-ontology` from any codebase.

What changed:

- Cloud-extraction promise ("AI extracts") → collaboration promise ("AI agent partners").
- Cost model — the cloud LLM cost disappears (Claude Code already covers user's LLM cost).
- Identity sharpened — not a generic ontology tool, but **the workbench where codebases meet AI agents**.

---

## 8. Immediate next actions (waiting on user)

This v2 doc only aligns *direction*. We still need to pick which phase to execute:

### Option A — Start Phase 1 immediately (UI identity alignment)

- `/` ↔ `/topology` swap
- Demo slim
- Landing copy
- Est: 1–2 days, 5–7 commits

### Option B — Phase 2 first (self-hosting)

- npm packaging + CLI
- Biggest tech change — accelerates everything else.
- Est: 1–2 days

### Option C — Review this doc + extra decisions

- Refine v2 assumptions (cost / audience / priority)
- Pick a phase afterwards.

My first-principle take: **A first**. Once the UI identity is aligned, the first screen users see when self-hosting will already express the right mission. Self-hosting comes after.
