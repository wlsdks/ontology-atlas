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

- Product name split (v6, 2026-06-03): **Context Atlas** is the user-facing
  macOS app / website brand and the macOS release asset identity.
  `oh-my-ontology` stays the repository, CLI binary, and MCP package name. The
  Tauri bundle product name is `Context Atlas`, the bundle identifier is
  `dev.jinan.context-atlas`, and DMG filenames use `context-atlas_*`.
  The Tauri bundle product name remains the installed app identity users see in
  Finder, Dock, and Launch Services.
- Primary audience: **developer + their AI agent**. Developer creates / refines nodes (CLI · installed macOS app); AI agent (Claude Code, Codex, Cursor) reads/writes the same vault via MCP to give better codebase answers. The hosted website is the product introduction and download entry point, not the daily writable workbench.
- Spine = `.md` documents → a growing ontology. Topology / tree / builder are *views* of that spine.
- PM / designer / ops are **bonus, not target**. If the surface happens to be friendly to them — good. We don't optimize for them.
- Quality bar (v7, 2026-06-05): **Context Atlas must feel like a top-tier
  designer-built macOS workbench, not a merely functional graph UI.** Every
  improvement should raise usability, visual finish, action feedback, and motion
  toward Apple/Toss-level craft while preserving restraint, accessibility, and
  local-first trust. Motion is part of the product language only when it
  clarifies state, continuity, or command feedback; decorative animation remains
  out of scope.

Working definition: an ontology here is not just a topology visualization or a
generic knowledge base. It is the codebase's executable meaning model:
`project`, `domain`, `capability`, and `element` nodes plus typed relations
that explain ownership, dependency, evidence, and impact for both humans and AI
agents.

### Expanded excellence target (2026-06-05)

Context Atlas should make ontology feel operational, not academic. The UI must
embed ontology concepts directly into the work loop: choose a canonical slug,
write or stage frontmatter-backed graph changes, then prove the result with
graph DB-style queries and MCP/CLI evidence. The graph should feel fast enough
to be used as an everyday query surface, expressive enough to show ownership,
dependency, evidence, and impact, and concrete enough that Claude Code/Codex can
use it through MCP without asking the user to restate the codebase model.

The practical bar:

1. **Designer-grade interaction** — compact, native-feeling controls, precise
   hover/focus states, clear command feedback, and motion that helps users
   understand what changed.
2. **Ontology-native expression** — every view should show which node, relation,
   slug, or proof handle the user is working with; no generic document-portal
   framing when the graph is the real model.
3. **Graph DB-level proof** — graph queries should expose schema, paths,
   relation checks, blast radius, facets, and result contracts as executable
   evidence, not static explanation.
4. **Agent-operable memory** — the same vault must remain readable and writable
   through MCP for Claude Code, Codex, and Cursor, with post-change validation
   gates that an agent can run before committing.

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
| **Developer** | Author + maintain the ontology as part of normal coding | CLI (`oh-my-ontology init/list/validate/add/find/import`), installed macOS app (`/ontology`, `/docs`) |
| **AI agent** (Claude Code, Cursor, …) | Read for context · write back new findings | MCP server (23 tools — read 15 + write 8) |
| ~~PM / designer / ops~~ | ~~Build mental model without reading source~~ | dropped (R11 fire #25 — developer-primary 결정 후) |

The two primary audiences are **the developer and their own AI agent**. Both work on the same `.md` files in the same git repo. PM-friendly side effects are bonus, not requirements.

> **2026-05-31 vision expansion (user).** The **human design surface** moves from "bonus" to an explicit **target capability** — for the *developer (and their team)*, not a pivot to PM/non-developer targeting. Atlas should be a *living blueprint canvas* a developer uses in meetings: fluidly add / **draft (임시저장, stage uncommitted)** / delete / experiment with the ontology, then commit-or-discard as a batch. This greenlights a unified builder staging/draft model + undo/redo (charter border-style: added=indigo underline, removed=dashed; no glow). Audience stays developer + AI agent. Growth model: **local-first now** (templates, shareable static-HTML export, npm/launch); a hosted/collaboration layer (backend+auth) is **deferred** — revisited only as a deliberate future product-direction decision, never introduced silently (R10 still holds). Full plan: `docs/superpowers/specs/2026-05-31-atlas-vision-roadmap.md`.

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

### New target — macOS-first desktop app exploration (2026-05-25)

The product should explore an installable macOS app as a first-class
distribution goal, not only the hosted website or `pnpm dev` workflow. This
fits the local-first promise: the user installs the workbench on their own Mac,
opens a vault folder from disk, and keeps the same markdown + MCP + CLI graph
loop without visiting the hosted site.

Quality bar: this must be desktop-grade, not a webview-shaped shortcut.
Compare against Obsidian, Claude Desktop, and Codex Desktop for the basics:
stable `.app` launch, trustworthy folder permission UX, recent-vault recall,
clear local data location, command/agent setup visibility, offline operation,
and a polished native-feeling window lifecycle. A weaker shell should remain an
internal prototype, not a user-facing distribution promise.

Recommended first slice:

1. Keep the existing Next.js static export as the frontend payload.
2. Prototype a macOS-only desktop shell with Tauri first.
3. Point the shell at the generated `out/` directory and preserve the current
   File System Access / local-vault behavior where possible.
4. Verify the app can open the dogfood vault, render `/docs`, `/ontology`,
   `/topology`, and `/ontology/edit`, and still hand off to CLI/MCP setup
   gates.
5. Keep signing and notarization wired into the tag-release path, while leaving
   updater and packaged MCP/CLI sidecars as separate distribution hardening work
   after the local prototype works.

Why Tauri first: this repo already uses `output: 'export'`, `images.unoptimized`,
and `trailingSlash`, which match the static frontend shape expected by Tauri's
Next.js guide. Electron remains a fallback if the desktop shell needs bundled
Node.js behavior, but it is heavier and macOS distribution still needs signing
and notarization.

Non-goal for the first slice: do not add backend/login/cloud or change the
source-of-truth model. The desktop app is another local shell over the same
vault, not a new data store.

Current readiness gates: `pnpm desktop:check` verifies the static export,
Tauri scaffold, and agent-handoff prerequisites before app smoke, while
`pnpm desktop:doctor` reports local Tauri CLI / Cargo / rustc / Xcode command
line tool readiness. The first `src-tauri/` shell is present; local prototype
execution now depends on Rust / Cargo being installed on the machine. See
`docs/DESKTOP-MACOS.md`.

2026-05-25 checkpoint: the first local `pnpm desktop:build` produced
`src-tauri/target/release/bundle/macos/Context Atlas.app` and the macOS
download artifact
`src-tauri/target/release/bundle/dmg/context-atlas_0.1.0_aarch64.dmg` after
adding the Tauri icon set derived from `public/logo.png` and a repo-owned
`hdiutil` DMG packager. The desktop shell now has a native Tauri vault bridge:
when WebView `showDirectoryPicker` is unavailable, it opens a native folder
dialog and adapts that folder into the same manifest/editor/image handle shape
used by the web prototype. The desktop root now waits for stored-vault restore;
if no vault is loaded in the Tauri runtime, it routes to `/docs/?intent=local`
and shows a vault setup welcome instead of showing the hosted marketing
landing page or immediately throwing a native picker over the workspace. The desktop picker also persists recent Tauri vault paths and can
reopen them without another Finder selection. The build also writes a `.sha256` checksum, and
`pnpm desktop:verify-app` launch-smokes the built `.app` long enough to catch
early Tauri/WebView startup crashes before DMG verification. `pnpm
desktop:verify-install` then mounts the generated DMG, verifies the
drag-to-Applications symlink target, copies the bundled app to a temporary
install folder, and launch-smokes that installed copy before cleanup. The
`.github/workflows/release-macos.yml` now fails closed on `v*` tags unless the
Apple Developer ID and notary secrets are present and structurally usable, then
passes docs-vault freshness, desktop checker tests, and native bridge tests
before importing the certificate in both macOS lanes. It builds Apple Silicon
on `macos-14` and Intel on `macos-15-intel`, route-smokes the static desktop payload,
runs `pnpm desktop:release-source` so the tag commit is the default-branch head,
runs `pnpm desktop:release-tag` so the v-prefixed tag matches package/Tauri/Cargo
versions before signing, runs `pnpm desktop:sign`, packages the signed app, runs
`pnpm desktop:notarize`, staples the DMG, refreshes its checksum, verifies the
final mounted artifact with signing and notarization required, and launch-smokes
the app copied from the DMG before attaching both architecture DMGs to a draft
GitHub Release.
The publish job first checks that the tag has no existing GitHub Release, so a
rerun or manual draft cannot mix stale DMG assets with newly signed artifacts.
`pnpm desktop:verify-download -- --allow-draft` byte-checks those draft assets
before the workflow publishes the release as stable. `pnpm
desktop:verify-download` then runs again as the public hosted CTA gate: it
fails unless a public non-draft GitHub Release exposes reachable
`context-atlas_*_aarch64.dmg` and `context-atlas_*_x64.dmg` assets plus
matching `.sha256` checksum files that name those same-version DMGs, and it
rejects unsupported extra `context-atlas_*.dmg` names so the GitHub Release
page cannot show ambiguous macOS downloads; it also rejects duplicate architecture
DMGs so each release has exactly one Apple Silicon and one Intel download. The
tag workflow intentionally stops
there: the installed macOS app is local-only and does not require Firebase
secrets or Hosting deploy steps. The separate `deploy-hosting` workflow owns the
static promo/download website and should be followed by `pnpm
desktop:verify-hosted` when the public `/ko/download/` route is expected to be
live.
`pnpm desktop:release-preflight`
is the local pre-tag command for readiness, docs-vault freshness, desktop
checker tests, runtime split tests, native bridge tests, runtime doctor, CLI/MCP
handoff against `docs/ontology`, the agent JSON setup/performance gate, build,
route smoke, DMG verification, and temporary install smoke before credentials
are used. `pnpm desktop:goal-audit -- --pr=<number> --tag=<tag>` requires PR and
tag evidence before starting that local preflight, then chains it with the
public release/hosted download status audit, giving the macOS desktop goal one
command that proves both the local artifact path and the public install path. It
writes `.tmp/desktop-goal-status.json` and `.tmp/desktop-goal-status.md` by
default, unless the operator overrides the evidence paths. The
post-release completion audit is
`pnpm desktop:release-status -- --pr=<number> --tag=<tag>`: it does not publish
anything, but it fails closed until tag/package/Tauri/Cargo version alignment,
PR review/merge readiness, active macOS release workflow availability, clean
local and remote same-tag Git ref slots, Apple release secret names, public stable
GitHub Release state, and public DMG/checksum download verification all pass. Its
`--json` mode reports `ready`, `blockerCount`, and per-check `next` actions for
goal runners or dashboards that need structured release blockers; stdout JSON is
compact to avoid small-buffer truncation, `--json-file` writes the same snapshot
as a pretty disk artifact when stdout may be wrapped by package-runner logs, and
`--include-hosted-surface` adds the `deploy-hosting.yml` workflow availability
check, required `FIREBASE_SERVICE_ACCOUNT_JSON` website deploy secret, and
deployed promo/download website verifier to the same blocker snapshot for full
goal-completion audits while leaving the macOS app release gate Firebase-free by
default.
`--markdown-file` writes a reviewer/operator checklist from the same audit
result. The snapshot carries `schemaVersion` and `generatedAt` so saved
release evidence has a stable contract and timestamp; `status`, `readyAt`, and
`blockedAt` make saved snapshots filterable by outcome, and each check carries a
stable machine id, `scope`, and `owner` with top-level `blockerIds` /
`localBlockerIds` / `externalBlockerIds` / `blockersByOwner` / `nextActions` so
automation can branch without scraping human labels; actionable blockers also
expose `commands[]` for exact diagnostics, setup prompts, pre-tag source
checks, the post-merge release tag push, `desktop:release-run` tag-commit-scoped workflow watch, and public
download verification, and Apple signing blockers include `missingSecrets[]` for
release-operator reconciliation. Firebase
Hosting remains a separate website
deployment check, not a macOS app release dependency. This is
evidence for goal completion, not a substitute for publishing signed/notarized
release assets.
The hosted landing page should now bias toward "Download macOS app"
and product explanation, with the browser folder picker treated as a prototype
fallback until public signed releases are uploaded.

### Option A — npm package + CLI

```bash
# user, from any project root
$ npx oh-my-ontology@latest

# starts:
# - treats the current directory as the vault
# - serves the local workbench on localhost:3210 for source development
# - opens the browser as a source-checkout fallback
# - production visual work moves through the signed macOS app
```

Pros:

- Zero install friction (just `npm` / `pnpm`).
- Any project becomes a potential vault.
- Offline-first by default.
- Next.js build output ships as-is (static export + tiny server).

Cons:

- Requires Node.js.
- Bundle is heavy after publish (Sigma + xyflow + …).

### Option B — macOS desktop app

Pros: feels local-first by default, removes the hosted-site mental model, and
can make folder picking / recent vaults / app launch more natural on macOS.
Cons: adds native packaging, signing, notarization, updater, and sidecar
questions that the web and CLI surfaces do not have.

### Option C — Just Next.js static export + a guide

Use after `pnpm dev`. No packaging. Document with environment variables.

Pros: fastest. Zero new deps.
Cons: blocks distribution (clone overhead).

### Recommendation: macOS app + CLI/MCP as the daily workbench

The desktop proof has graduated from exploration into the primary visual
distribution track. Context Atlas should be the daily local workbench for users
who want to pick a vault folder, browse the ontology, repair relations, and run
graph proof without opening a hosted web editor. The CLI and MCP package remain
the developer/agent execution track: `oh-my-ontology` owns init, bootstrap,
validation, graph DB-style queries, and write preflights; the MCP server exposes
the same graph to Claude Code, Codex, Cursor, and other agents.

The hosted website is now the product introduction and download surface. It
should not be treated as the writable workbench. Keep browser-based local vault
flows only as source/dev fallbacks, while installed macOS + CLI/MCP carry the
real local-first product promise.

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
3. ✅ CLI command (`oh-my-ontology`) — `npx oh-my-ontology init <folder>` scaffolds the vault. The installed app `/docs` "Create starter seed" button is the no-terminal alternative.
4. ⏸ Auto-generated AGENTS.md — DEFERRED (manual updates + dogfood vault cover this)
5. ✅ `docs/ontology/` dogfood vault — 79 nodes describing our own mental model

### Agent practitioner concerns map

Context Atlas should not add AI-agent features because they look advanced. Each
agent-facing feature should reduce a known failure mode for Claude Code, Codex,
or another MCP-connected coding agent:

- **Context reliability** — show which AGENTS.md / CLAUDE.md / ontology nodes /
  MCP results are the basis for the next action.
- **Tool boundary** — keep MCP setup, tool filtering, approval boundaries,
  duplicate tool names, and failed connections visible before the agent writes.
- **Evidence loop** — make `health`, graph DB pack checks, and post-change sync
  easy to copy, run, and compare after a change.
- **Memory drift** — surface stale markdown memory, stale skills/hooks, and
  duplicate ontology concepts as graph maintenance work.
- **Workflow fit** — prefer simple composable workflows over long autonomous
  agent runs until the graph evidence supports more autonomy.

This is now represented in the dogfood vault as
`capabilities/agent-practitioner-concerns-map`, linked to MCP setup, graph
readiness, onboarding brief, conflict guard, and SessionStart context injection.

### 🚫 Phase 4 — Polish for non-developers — **dropped (R11 fire #25)**

PM-primary 결정 reverted. v3 mission: developer + their AI agent only. T33-T36 의 비개발자 polish 항목들은 *if-bonus* 로 격하 (의도적 우선순위 0). 사용자 요청 들어오면 재평가.

### ⏳ Phase 4 (replacement) — Developer + AI agent depth

1. ✅ CLI 명령 확장 — 43 commands across vault scaffold, MCP verify, import, repo bootstrap, deterministic compile, relationship explanation, transitive reachability, relation preflight, agent handoff, growth/maintenance queue, graph CRUD, and graph deep dive
2. ✅ AI agent dogfood 사이클 — Claude Code 가 mcp 로 codebase 분석 + add_concept 워크플로 검증 (R12 + R14 메타 검증)
3. ⏳ 10-minute memory loop proof — fresh repo 에서 `init → bootstrap → MCP 기반 답변 개선 → agent sync 제안 → git diff 리뷰 → 다음 task 개선` 이 10분 안에 보이는지 검증. 이게 안 되면 아직 제품이 아니라 좋은 엔진.
4. ~~VSCode plugin~~ — R15 에서 제거. 이유: daily driver 가 Claude Code / Codex 같은 AI-agent 터미널로 전환되며 VSCode 자체 점유율 감소. 코드↔ontology 점프 / backlinks / write 는 mcp + cli 로 같은 가치 cover.

---

## 7. Old vs. new mission

### Old mission (per AGENTS.md, current)

> The user writes prose; the system extracts concepts, relations, evidence; humans review and approve; the result grows into three views (topology, tree, ERD).

### Current mission

> **A repo-native memory layer for AI coding agents, backed by an ontology of one codebase.**
>
> - Humans: review and refine the repo-local memory as normal markdown/git diffs.
> - AI agents (Claude Code, Cursor, Codex): read, query, and propose updates via MCP or CLI.
> - Bootstrap and sync reduce manual ontology authoring; the graph is maintained as a side effect of real code work.
> - All inputs share one vault graph. All views (tree hub / topology sub-view / ERD) are optional workbench surfaces.
> - Distributed as an installed macOS workbench plus CLI/MCP packages for
>   terminal and AI-agent workflows.

What changed:

- Cloud-extraction promise ("AI extracts") → collaboration promise ("AI agent partners").
- Cost model — the cloud LLM cost disappears (Claude Code already covers user's LLM cost).
- Identity sharpened — not a generic ontology tool, but **a local-first memory layer for AI coding agents**.

---

## 8. Current completion bar

The direction is no longer waiting on a phase pick. The active bar is evidence:

- Installed macOS app launches and route-smokes the ontology workbench surfaces.
- `/ontology` presents Browse / Write / Query as one loop over the same vault
  graph, not as documentation navigation.
- `/ontology/edit` stays narrowly scoped to relation write review, source-file
  patch preview, preflight, and proof handoff.
- `/ontology/insights` proves the local markdown graph can be queried like a
  small graph database through health, scans, paths, relation checks, and
  explanation contracts.
- CLI/MCP proof gates must stay runnable over `docs/ontology` before the goal is
  treated as complete.
