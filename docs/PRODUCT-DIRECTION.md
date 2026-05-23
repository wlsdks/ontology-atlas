# PRODUCT DIRECTION — Ontology workbench (humans + AI agents co-author)

> Written (v2): 2026-05-01
> Decisions captured: the user confirmed **Direction A** (ontology-first) and added **dogfooding + AI-agent partnership** as a new direction.
> This file overlays v2 on top of v1's strategic diagnosis (left in place); **the decisions and the new direction** below are what's current.

---

## TL;DR — first principle in one line (v3, 2026-05-04)

> **One codebase, one ontology, that the developer and their AI agent grow together.**

Launch framing (v4, 2026-05-18):

> **A repo-native memory layer for Claude Code, Cursor, and Codex.**
>
> Your AI coding agent forgets your codebase. Give it a local, git-backed
> mental model it can read, query, and maintain through MCP.

- Primary audience: **developer + their AI agent**. Developer creates / refines nodes (CLI · web UI); AI agent (Claude Code, Codex, Cursor) reads/writes the same vault via MCP to give better codebase answers.
- Spine = `.md` documents → a growing ontology. Topology / tree / builder are *views* of that spine.
- PM / designer / ops are **bonus, not target**. If the surface happens to be friendly to them — good. We don't optimize for them.

### Why developer-primary

- Developer already lives in the codebase — the *cost* of authoring frontmatter (slug / kind / domain / dependencies) is small for them.
- Developer's AI agent (the *real* daily user of `mcp/` 23 tools) needs ground-truth structure to give better answers. Without a developer maintaining it, the ontology rots.
- The *differentiator* vs Protégé / Notion / OWL editors = "ontology that lives next to the code, in the same git repo, that the developer + AI agent grow together."

### Market framing guardrail (v4)

Do not lead with "ontology editor" in launch copy. Developers do not want a new
knowledge base they must manually maintain.

Lead with the daily AI-coding pain:

> Your AI coding agent forgets your codebase. Give it a local, git-backed memory
> it can read and maintain.

The ontology graph is the substrate. The product promise is cheaper, durable
agent memory.

Canonical internal note:
[`docs/AGENT-MEMORY-POSITIONING.md`](AGENT-MEMORY-POSITIONING.md).

### Required product loop

This loop must work before the project is treated as launch-ready:

```text
init -> bootstrap -> agent answers better through MCP -> agent proposes sync
-> developer reviews diff -> next task benefits
```

Target: first visible value in a fresh repo within 10 minutes.

Failure mode: if the user feels they must "write an ontology" before seeing
value, the product becomes a niche ontology tool instead of an AI-agent memory
layer.

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

## 2. One primary audience (v3 — PM dropped)

| Audience | Role | Primary surface |
|---|---|---|
| **Developer** | Author + maintain the ontology as part of normal coding | CLI (`oh-my-ontology init/list/validate/add/find/import`), web UI (`/ontology`, `/docs`) |
| **AI agent** (Claude Code, Cursor, …) | Read for context · write back new findings | MCP server (23 tools — read 15 + write 8) |
| ~~PM / designer / ops~~ | ~~Build mental model without reading source~~ | dropped (R11 fire #25 — developer-primary 결정 후) |

The two primary audiences are **the developer and their own AI agent**. Both work on the same `.md` files in the same git repo. PM-friendly side effects are bonus, not requirements.

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

Tools (23 — read 15 + write 8):

- read: `list_concepts`, `get_concept`, `get_concepts`, `find_evidence`, `find_backlinks`, `find_neighbors`, `find_path`, `list_kinds`, `find_orphans`, `query_concepts`, `compile_ontology`, `query_ontology`, `validate_vault`, `analyze_repo_structure`, `infer_imports`
- write: `add_concept`, `add_concepts`, `add_relation`, `add_relations`, `patch_concept`, `delete_concept`, `rename_concept`, `merge_concepts`

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

1. ✅ `mcp/` package — MCP server (`oh-my-ontology-mcp`)
2. ✅ 23 tools (read 15 + write 8): `list_concepts` / `get_concept` / `get_concepts` / `find_evidence` / `find_backlinks` / `find_neighbors` / `find_path` / `list_kinds` / `find_orphans` / `query_concepts` (typed filter DSL) / `compile_ontology` / `query_ontology` / `validate_vault` / `analyze_repo_structure` (R16) / `infer_imports` (R17) / `add_concept` / `add_concepts` / `add_relation` / `add_relations` / `patch_concept` / `delete_concept` / `rename_concept` / `merge_concepts` (R11 — atomic graph-level write)
3. ✅ CLI command (`oh-my-ontology`) — `npx oh-my-ontology init <folder>` scaffolds the vault. The web `/docs` "Create starter seed" button is the no-terminal alternative.
4. ⏸ Auto-generated AGENTS.md — DEFERRED (manual updates + dogfood vault cover this)
5. ✅ `docs/ontology/` dogfood vault — 31 nodes describing our own mental model

### 🚫 Phase 4 — Polish for non-developers — **dropped (R11 fire #25)**

PM-primary 결정 reverted. v3 mission: developer + their AI agent only. T33-T36 의 비개발자 polish 항목들은 *if-bonus* 로 격하 (의도적 우선순위 0). 사용자 요청 들어오면 재평가.

### ⏳ Phase 4 (replacement) — Developer + AI agent depth

1. ✅ CLI 명령 확장 — 33 commands across vault scaffold, MCP verify, import, repo bootstrap, deterministic compile, relation preflight, agent handoff, growth/maintenance queue, graph CRUD, and graph deep dive
2. ✅ AI agent dogfood 사이클 — Claude Code 가 mcp 로 codebase 분석 + add_concept 워크플로 검증 (R12 + R14 메타 검증)
3. ⏳ 10-minute memory loop proof — fresh repo 에서 `init → bootstrap → MCP 기반 답변 개선 → agent sync 제안 → git diff 리뷰 → 다음 task 개선` 이 10분 안에 보이는지 검증. 이게 안 되면 아직 제품이 아니라 좋은 엔진.
4. ~~VSCode plugin~~ — R15 에서 제거. 이유: daily driver 가 Claude Code / Codex 같은 AI-agent 터미널로 전환되며 VSCode 자체 점유율 감소. 코드↔ontology 점프 / backlinks / write 는 mcp + cli 로 같은 가치 cover.

---

## 7. Old vs. new mission

### Old mission (per AGENTS.md, current)

> The user writes prose; the system extracts concepts, relations, evidence; humans review and approve; the result grows into three views (topology, tree, ERD).

### New mission (proposed in this doc)

> **A repo-native memory layer for AI coding agents, backed by an ontology of one codebase.**
>
> - Humans: review and refine the repo-local memory as normal markdown/git diffs.
> - AI agents (Claude Code, Cursor, Codex): read, query, and propose updates via MCP or CLI.
> - Bootstrap and sync reduce manual ontology authoring; the graph is maintained as a side effect of real code work.
> - All inputs share one vault graph. All views (tree hub / topology sub-view / ERD) are optional workbench surfaces.
> - Distributed as a package — `npx oh-my-ontology` from any codebase.

What changed:

- Cloud-extraction promise ("AI extracts") → collaboration promise ("AI agent partners").
- Cost model — the cloud LLM cost disappears (Claude Code already covers user's LLM cost).
- Identity sharpened — not a generic ontology tool, but **a local-first memory layer for AI coding agents**.

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
