# PRODUCT DIRECTION — Ontology workbench (humans + AI agents co-author)

> **[v10 Identity, 2026-07-18] — agent-native, human-sovereign (agents write directly, humans make final judgments).**
> This product is not a "system *for* agents." It is **a single layer of meaning that humans and AI agents read and edit together**, with agents being formal users just like humans. Here, *meaning layer* refers to the markdown folder where each part of the product's identity, responsibility, and proof are recorded.
> Agents maintain this folder in its latest state and are also the ones who read it most (MCP/CLI), while humans make the final judgment on what the correct meaning is — what humans see is ordinary markdown and git diffs, and the original files are on their own disks. These two categories and locations differ. One is a repository only machines read (vector DB · auto extraction), which loses in automation scale competition. The other is a wiki only humans use, which quickly becomes outdated.
> **Marketing copy starts from the friction experienced while using agents, but the product's core remains "a set used together by both."** Every screen must satisfy two things: can agents use it directly (typed facts · redirect text), and can humans read and judge it (plain language · visible priority)?
> The first screen is also split. The public web has an introduction page (the place to bring people in), and the installed app has a first-run screen that opens folders immediately like Obsidian (no marketing copy).

> **[Current Canonical] This document handles product direction, `docs/DECISIONS.md` handles decision rationale, and active execution tracks in `docs/BACKLOG.md` handle implementation order.**
> `docs/plans/PRODUCT-PLAN-2026-07.md` and other files in `docs/plans/` are historical records preserving intent and review history at the time; they do not indicate current state or execution order.
> **[v9, 2026-07-17]** What the plan at that time defined was four things. ① Split the product into two layers — Layer 1 is core functionality running on your computer, never changing; Layer 2 is Atlas Network (Spec standard · Hub · paid Team Sync created only after demand is confirmed). ② Narrow the primary target to one group: "tech leads of 2-10 person teams." ③ Correct the multiple stakeholders noted in v8 to "those who ask questions after passing the gate." ④ The core differentiator is a feature proving that written content is still valid — catching mismatches between code and docs, placing approval in three stages, and preventing prompt injection. The v2~v8 body of this file is kept for record.

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

- Product name split (v6, 2026-06-03): **Ontology Atlas** is the user-facing
  desktop app / website brand and the release asset identity.
  `ontology-atlas` stays the repository, CLI binary, and MCP package name. The
  Tauri bundle product name is `Ontology Atlas`, the bundle identifier is
  `dev.jinan.ontology-atlas`, and DMG filenames use `ontology-atlas_*`.
  The Tauri bundle product name remains the installed app identity users see in
  Finder, Dock, and Launch Services.
- Primary audience (v8, 2026-06-06): **everyone involved in deciding things about a product or system** — planners, marketers, C-level decision-makers, developers, and AI agents. The developer + AI-agent loop is still the strongest **wedge** — the narrow first entry point that gets a product adopted — because that pair is the one that can actually keep the git-backed source of truth up to date. But the Atlas people look at must let non-developers understand the core of the business or product quickly, without reading source code.
- Everything rests on the `.md` documents, which grow into an ontology. Topology is the current map workbench; tree and Builder are historical ways of looking at those same documents.
- Non-developer stakeholders are **target readers and decision participants**, not an afterthought. The app should show the core domains, capabilities, dependencies, and impact paths clearly enough for planning, marketing, leadership, and engineering discussions.
- Quality bar (v7, 2026-06-05): **Ontology Atlas must feel like a top-tier
  designer-built macOS workbench, not a merely functional graph UI.** Every
  improvement should raise usability, visual finish, action feedback, and motion
  toward Apple/Toss-level craft while preserving restraint, accessibility, and
  local-first trust. Motion is part of the product language only when it
  clarifies state, continuity, or command feedback; decorative animation remains
  out of scope.

Working definition: an ontology here is not just a topology visualization or a
generic knowledge base. It is the executable meaning model of a product and the
codebase that realizes it, written as five authorable kinds and the typed
frontmatter relations Atlas actually implements. The exact discriminator,
`broader`/`is_a` support boundary, and non-inference contract have one authority:
[`ONTOLOGY-ATLAS-SPEC.md` §2](ONTOLOGY-ATLAS-SPEC.md#2-the-five-authorable-node-kinds-and-reserved-reader-kind).
This direction document decides why the product exists; it does not maintain a
second schema glossary.

### What Atlas should turn into ontology nodes, and what it should not

Atlas is **not only a developer plugin** and **not only a raw source-code
structure index**. It should make the product/business legible from the graph,
then let a developer or AI agent trace that meaning down to the implementation
that proves it.

The primary artifact is the **business-to-code meaning layer**. People normally
read it in the order project outcome → responsibility domain → observable
capability → implementation element, with `document` nodes preserving the ADR,
policy, runbook, or reference material that explains those concepts. That is a
reading path, not a second kind definition; the normative includes, excludes,
examples, and counterexamples stay in the specification above.

Business concepts are first-class when they are load-bearing: they define the
market/category, operating model, user-visible behavior, policy, ownership,
decision paths, or impact. A CRM's "deal", "pipeline", and "approval" are
useful ontology terms when they help a planner, marketer, C-level decision-maker,
developer, or AI agent understand what the business does and which capabilities
and systems carry it.

Source code structure enters as proof and traceability. A file path by itself is
evidence, not a node. It earns an `element` only when its distinct implementation
role helps answer a product, impact, or verification question. It earns a
`capability` or `domain` only through the independent semantic tests in the
specification; a folder, team, technology, or workflow name never promotes itself.

The product should therefore optimize the loop:

```text
business question -> graph map of domains/capabilities -> implementation and
evidence trace -> human/agent meaning decision -> git-backed ontology update
-> next planning, marketing, leadership, development, or agent task starts with
the same model
```

AST/code-index and source-intelligence tools such as language servers, Serena,
CodeGraph, and built-in search are reference points for the
implementation-evidence side of that loop: parse deterministically, index
locally, answer structural questions without re-reading the repo. Atlas should
learn from those properties without copying implementation: local-first
indexing, stable node identifiers, incremental refresh, query-plan style
narrowing, and impact traversal. Atlas' distinct value is the curated business
and product meaning layer on top: what the organization is trying to do, which
capabilities carry it, which implementation proves it, what changes affect it,
and what a human or AI agent should verify before acting.

The coding-agent promise is not that Atlas replaces source search or stores an
exhaustive symbol graph. Built-in search, grep, language servers, Serena,
CodeGraph, and AST indexes should remain optional structural layers for
definitions, callers, imports, and local code impact. Atlas must work for plain
Claude Code or Codex after only the Atlas MCP server or CLI is connected; no
external code index, source-intelligence service, or extra agent plugin may be a
precondition for first value. Source tools are accelerators after the Atlas
meaning packet has narrowed the work. Atlas should tell the agent which
structural question to ask, which capability or domain gives that code meaning,
and which verification path makes the answer safe to use. The ontology should
therefore store meaningful implementation evidence, not every code fact: files,
classes, commands, routes, tests, and MCP tools become `element` nodes only when
they help trace a business/product capability, impact path, or agent handoff.

### Expanded excellence target (2026-06-05)

Ontology Atlas should make ontology feel operational, not academic. The UI must
make the core of a product or project visible at a glance, then let users trace
from business domain to capability to implementation evidence. The graph should
feel fast enough to be used as an everyday query surface, expressive enough to
show ownership, dependency, evidence, and impact, and concrete enough that
planners, marketers, C-level decision-makers, developers, and Claude Code/Codex
can use the same model without asking each other to restate the system.

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

### Why the developer + agent loop is the first entry point

- The developer already works right next to the source of truth. They can keep
  the implementation evidence current because the code diff and the ontology
  diff sit side by side in the same commit.
- The developer's AI agent does the daily tidying: after a code change it can
  query, validate, propose, and write back into the same `.md` graph.
- That pair is the way in, not the whole audience. Atlas becomes valuable when
  planners, marketers, C-level decision-makers, developers, and AI agents can
  all read the same domains, capabilities, ownership, dependencies, evidence,
  and impact without translating between separate tools.
- What sets this apart from Protégé / Notion / OWL editors is not that the
  ontology is "for developers only". It is that business meaning and code
  evidence sit in one git-backed graph that people actually make decisions from.

### Market framing guardrail (v4)

Do not lead with "ontology editor" in launch copy. Developers do not want a new
knowledge base they must manually maintain.

Lead with the daily AI-coding pain:

> Your AI coding agent forgets your codebase. Give it a local, git-backed memory
> it can read and maintain.

The ontology graph is what the product is built on. What we promise the user is
agent memory that costs less and does not go stale.

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

### Decision 1 — Direction A (ontology-first, historical; superseded 2026-07-29)

This records the route framing that was reviewed at the time. The current route
contract is: a web visitor without a vault sees the gateway at `/`; a vault-bearing
web visitor and the installed app enter the map/first-run surface; and
`/topology` is the explicit map address. The retired `/ontology` routes redirect
to current surfaces and do not own separate chrome.

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

## 2. Audience model (v8 — shared business/code atlas)

| Audience | Role | Primary surface |
|---|---|---|
| **Planner / PM / marketer** | Understand the product/business core, narratives, ownership, and change impact without reading source | installed desktop app (`/topology` and Docs; `/ontology` is a compatibility redirect; macOS, Windows x64 beta), static/shared vault exports |
| **C-level / decision-maker** | See what the organization/system is made of, which capabilities matter, and what changes affect strategic bets | overview, topology, graph proof/impact summaries |
| **Developer** | Maintain the graph as implementation changes; connect code artifacts to domains/capabilities | CLI (`ontology-atlas init/list/validate/add/find/import/index`), installed desktop app (`/topology`, `/docs`; `/ontology` is a compatibility redirect) |
| **AI agent** (Claude Code, Codex, Cursor, …) | Read for context · write back findings · keep the graph current through verified MCP/CLI loops | MCP server (runtime-advertised read/write inventory), vault-scoped Git evidence/checkpoint, contextual topology handoff, agent heartbeat, explicit-project agent brief |

The single artifact serves all audiences: a local, git-backed ontology that
links business language, product capabilities, implementation evidence, and
change impact. Developer + agent workflows are the wedge that keeps it fresh;
the installed app/topology is the shared reading and decision surface.

> **2026-06-06 correction (user).** Atlas is not a developer-only service. It
> should let planners, marketers, C-level decision-makers, developers, and AI
> agents see the core of a business/product quickly through the ontology. The
> developer + agent MCP loop is a wedge and maintenance engine, not the whole
> product.

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

### 3-B. Write path (works)

While analyzing code, the AI agent commits newly discovered facts to the ontology:

```bash
# example: after the agent inspects a file
$ ohmy add element src/features/billing/lib/cycle-rule.ts \
    --kind element \
    --capability "Subscription cycle calculation" \
    --project billing-service
```

Options:

1. **CLI** — `ontology-atlas add ...` or the current source-checkout CLI
2. **MCP server** — Claude Code/Codex calls `add_concept` / `add_relation`
   after read-first and duplicate checks
3. **Contextual topology writing** — a person fills one typed relation socket
   beside the map and reviews the resulting frontmatter write

An agent can propose concepts and, once they are accepted, write them through
MCP. People judge that same meaning by reading plain Markdown, git diffs, and
the topology workbench. There is no second, program-only copy of the graph
anywhere.

### 3-C. Two-way sync

```
human edits Markdown or the contextual map writer
        │
        ▼
ontology graph (vault frontmatter)
        ▲
        │
AI agent reads codebase → adds nodes via MCP/CLI
```

Same graph. Same vault. Different input paths.

### 3-D. Project meaning finalization

Once the accepted writes are saved, the agent validates the vault and calls
`finalize_project_meaning` on one named `kind: project` node. The tool saves a
versioned record — a *receipt* — of the five competency answers, tied to that
project's current graph and to a cleaned-up note of where the source code came
from. It does not save the raw answers or the private path to your code, and
`ok: true` means one thing only: the receipt was written.

Asking again with `query_ontology({ operation: "agent_brief", project: SLUG })`
— or `ontology-atlas agent-brief --project SLUG` — works the
`meaningAssessment` out from scratch. Three things stay separate: whether the
structure is complete, whether each competency answer has evidence behind it,
and whether the source has been rechecked. If a piece of evidence is still
unresolved, if the graph has changed, or if the source cannot be checked, the
answer comes back as `needs_evidence`, `review_required`, or `invalid`. Atlas
never blends those three into a single confidence score or percentage. You have
to name the project explicitly, because in a vault holding more than one
project an unnamed answer would be misleading.

---

## 4. Local package — how to distribute

### New target — macOS-first desktop app exploration (2026-05-25)

The installable macOS app is the first-class writable workbench, not a future
exploration. The user opens a vault folder from disk and keeps the same
markdown + MCP + CLI graph loop without a backend. On the hosted web, root is
the gateway until a vault is loaded; `/topology` is the explicit map address.

Quality bar: it has to feel like a real Mac app, not a web page in a window.
Compare against Obsidian, Claude Desktop, and Codex Desktop on the basics: the
`.app` launches reliably, asking for folder permission feels trustworthy, it
remembers recently opened vaults, it says clearly where the local data is, the
command and agent setup are easy to find, it works offline, and opening,
resizing, and closing the window behave the way Mac users expect. Anything
weaker than that stays an internal prototype; we do not hand it out.

Current distribution contract:

1. Next.js static export is the Tauri frontend payload.
2. The installed app opens local vaults through the native bridge and verifies
   current Docs, Topology (including contextual writing), Insights, Projects,
   Agents, and Git routes.
3. `/ontology`, `/ontology/edit`, and `/ontology/studio` remain compatibility
   redirects into the topology workbench; they are smoke inputs, not separate
   product surfaces.
4. Signing, notarization, release slots, checksums, and installed-app proof
   remain tag-release gates.
5. Packaged MCP/CLI sidecars and auto-update remain separate distribution
   slices. npm distribution is retired; agent setup fails closed and points
   source contributors at local entry points.

Why Tauri first: this repo already uses `output: 'export'`, `images.unoptimized`,
and `trailingSlash`, which match the static frontend shape expected by Tauri's
Next.js guide. Electron remains a fallback if the desktop shell needs bundled
Node.js behavior, but it is heavier and macOS distribution still needs signing
and notarization.

What this first piece of work deliberately does not do: it does not add a
backend, a login, or any cloud service, and it does not change where the truth
lives. The desktop app is one more local window onto the same vault, not a new
place to store data.

Current readiness gates: `pnpm desktop:check` verifies the static export,
Tauri scaffold, and agent-handoff prerequisites before app smoke, while
`pnpm desktop:doctor` reports local Tauri CLI / Cargo / rustc / Xcode command
line tool readiness. The first `src-tauri/` shell is present; local prototype
execution now depends on Rust / Cargo being installed on the machine. See
`docs/DESKTOP-MACOS.md`.

2026-05-25 checkpoint: the first local `pnpm desktop:build` produced
`src-tauri/target/release/bundle/macos/Ontology Atlas.app` and the macOS
download artifact
`src-tauri/target/release/bundle/dmg/ontology-atlas_1.0.0_aarch64.dmg` after
adding the Tauri icon set derived from `public/logo.png` and a repo-owned
`hdiutil` DMG packager. The desktop shell now has a native Tauri vault bridge:
when WebView `showDirectoryPicker` is unavailable, it opens a native folder
dialog and adapts that folder into the same manifest/editor/image handle shape
used by the web prototype. The same adapter now carries ontology-block
import/export as well: INDEX import recursively reads the selected `.md` block
through the shim's `values()` iterator and keeps the approval-before-write merge
preview, while realm export writes its bounded subtree through a purpose-titled
native picker. The desktop root now waits for stored-vault restore;
if no vault is loaded in the Tauri runtime, it routes to `/docs/?intent=local`
and shows a vault setup welcome instead of showing the hosted marketing
landing page or immediately throwing a native picker over the workspace. The desktop picker also persists recent Tauri vault paths and can
reopen them without another Finder selection. The build also writes a `.sha256` checksum, and
`pnpm desktop:verify-app` launch-smokes the built `.app` long enough to catch
early Tauri/WebView startup crashes before DMG verification. `pnpm
desktop:verify-install` then mounts the generated DMG, verifies the
drag-to-Applications symlink target, copies the bundled app to a temporary
install folder, opens that installed copy through LaunchServices, and requires a
visible Ontology Atlas window plus Accessibility text before cleanup. The
`.github/workflows/release-macos.yml` accepts only a `workflow_dispatch` tag
input from `main`. An unprivileged admission job binds that tag to the current
`main` SHA before the main-only `release-signing` environment exposes
Apple/Tauri credentials. It then passes docs-vault freshness, desktop checker
tests, and native bridge tests before importing the certificate. It builds Apple Silicon
on `macos-14` and Intel on `macos-15-intel`, route-smokes the static desktop payload,
runs `pnpm desktop:release-source -- --mode=pin` so the tag remains bound to the admitted SHA,
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
`ontology-atlas_*_aarch64.dmg` and `ontology-atlas_*_x64.dmg` assets plus
matching `.sha256` checksum files that name those same-version DMGs, and it
rejects unsupported extra `ontology-atlas_*.dmg` names so the GitHub Release
page cannot show ambiguous macOS downloads; it also rejects duplicate architecture
DMGs so each release has exactly one Apple Silicon and one Intel download. The
protected desktop release workflow intentionally stops
there: the installed macOS app is local-only and does not require any website
deploy secrets. The separate GitHub Pages `deploy-pages` workflow owns the
static promo/download website and should be followed by `pnpm
desktop:verify-hosted` when the public `/ko/download/` route is expected to be
live.
`pnpm desktop:release-preflight`
is the local pre-tag command for readiness, docs-vault freshness, desktop
checker tests, runtime split tests, native bridge tests, runtime doctor, CLI/MCP
handoff against `docs/ontology`, the agent JSON setup/performance gate, build,
route smoke, LaunchServices app content proof (`--open-app --require-window
--require-owner-name="Ontology Atlas" --min-window-size=1040x720
--require-accessibility-text="Ontology Atlas"`), DMG verification, and temporary
install smoke before credentials are used. `pnpm desktop:goal-audit -- --pr=<number> --tag=<tag>` requires PR and
tag evidence before starting that local preflight, then chains it with the
public release/hosted download status audit, giving the macOS desktop goal one
command that proves both the local artifact path and the public install path. It
writes `.tmp/desktop-goal-status.json` and `.tmp/desktop-goal-status.md` by
default, unless the operator overrides the evidence paths. The
post-release completion audit is
`pnpm desktop:release-status -- --pr=<number> --tag=<tag>`: it does not publish
anything, but it fails closed until tag/package/Tauri/Cargo version alignment,
PR review/merge readiness, active macOS release workflow availability, clean
local and remote same-tag Git ref slots, Developer ID direct-download secret names, public stable
GitHub Release state, and public DMG/checksum download verification all pass. Its
`--json` mode reports `ready`, `blockerCount`, and per-check `next` actions for
goal runners or dashboards that need structured release blockers; stdout JSON is
compact to avoid small-buffer truncation, and `--json-file` writes the same
snapshot as a pretty disk artifact when stdout may be wrapped by package-runner
logs. The hosted promo/download website deploys separately through GitHub Pages
(`deploy-pages.yml`) and is intentionally not part of this macOS app release
blocker snapshot.
`--markdown-file` writes a reviewer/operator checklist from the same audit
result. The snapshot carries `schemaVersion` and `generatedAt` so saved
release evidence has a stable contract and timestamp; `status`, `readyAt`, and
`blockedAt` make saved snapshots filterable by outcome, and each check carries a
stable machine id, `scope`, and `owner` with top-level `blockerIds` /
`localBlockerIds` / `externalBlockerIds` / `blockersByOwner` / `nextActions` so
automation can branch without scraping human labels; actionable blockers also
expose `commands[]` for exact diagnostics, setup prompts, pre-dispatch source
checks, post-merge tag creation/push, `desktop:release-run` exact workflow_dispatch watch, and public
download verification, and Developer ID direct-download signing blockers include `missingSecrets[]` for
release-operator reconciliation. GitHub Pages owns the separate website
deployment check and is not a macOS app release dependency. Firebase Hosting
is historical, not a current deployment surface. This is
evidence for goal completion, not a substitute for publishing signed/notarized
release assets.
The hosted landing page biases toward the installer selected from generated
release facts and product explanation; the browser folder picker remains the
web gateway fallback when installation is not the visitor's path.

### Option A — npm package + CLI (historical, retired)

> **Result (2026-07-27, `docs/DECISIONS.md`)**: The part distributed via npm within this was **abandoned**. The paragraph below is only a record of content reviewed at that time, not an actually executed command — so it is not written as a copy-pasteable code block. The CLI itself continues to live via source checkout path.

Reviewed proposal: Download and run the latest CLI with one `npx` line from the project folder. View the current folder as a vault, launch the source development workbench on localhost:3210, open the browser to an alternative path during source checkout, and perform actual visual work in the signed macOS app.

Pros:

- Zero install friction (just `npm` / `pnpm`).
- Any project becomes a potential vault.
- Offline-first by default.
- Next.js build output ships as-is (static export + tiny server).

Cons:

- Requires Node.js.
- Bundle is heavy after publish (Sigma + xyflow + …).
- Puts the distribution channel outside the product — a registry the user has
  to trust, and 38 files of guidance that stay false until someone publishes.
  This is what killed the npm half.

### Option B — macOS desktop app

Pros: feels local-first by default, removes the hosted-site mental model, and
can make folder picking / recent vaults / app launch more natural on macOS.
Cons: adds native packaging, signing, notarization, updater, and sidecar
questions that the web and CLI surfaces do not have.

### Option C — Just Next.js static export + a guide

Use after `pnpm dev`. No packaging. Document with environment variables.

Pros: fastest. Zero new deps.
Cons: blocks distribution (clone overhead).

### Recommendation: installed desktop app (carrying the MCP server) + CLI as the daily workbench

> **2026-07-27 Update**: The distribution path was narrowed to **Option B** — a DMG with Apple signing and notarization. Here, *signing* is stamping the app with "who made this app" using a developer certificate issued by Apple, and *notarization* is sending that app to Apple's server for malware inspection. macOS blocks execution if either is missing.
> The app bundles and runs a compiled MCP server within its own bundle, and the 「Agent Connection」 button writes the agent-side config file on behalf of the user. Thus, **both the human-facing screen and the agent connection channel** are installed with one download. Option A's CLI remains via source checkout path; npm is not a distribution channel.
>
> **2026-08-01 Update**: Expanded the same Tauri bundle to Windows x64 public beta.
> Windows installers still lack code signing, so two risks are listed before the download button — SmartScreen showing "Publisher Unknown" warning, and installation potentially being blocked on company-managed PCs.
> This is not lowering macOS signing standards but rather an owner-approved exception to test beta demand. Windows CI requires dependency checks · Microsoft Defender checks · unattended installation · app execution · installed MCP operation to all pass before releasing, but does not claim to have checked Windows 11 SmartScreen screens.

The desktop proof has graduated from exploration into the primary visual
distribution track. Ontology Atlas should be the daily local workbench for users
who want to pick a vault folder, browse the ontology, repair relations, and run
graph proof without opening a hosted web editor. The CLI and MCP server remain
the developer/agent execution track: `ontology-atlas` owns init, bootstrap,
validation, graph DB-style queries, and write preflights; the MCP server exposes
the same graph to Claude Code, Codex, Cursor, and other agents.

The hosted website is the product introduction and download entry point. It
should not be treated as the writable workbench. Keep browser-based local vault
flows as the install-free/degraded fallback, while the installed app + CLI/MCP carry the
real local-first product promise.

---

## 5. The agent-as-partner surface

### 5-A. MCP server

The `ontology-atlas-mcp` server ships compiled inside the desktop app bundle;
npm publishing is retired (`docs/DECISIONS.md`, 2026-07-27). Claude
Code-compatible:

```json
// .mcp.json or settings — written for you by the app's "Connect agent" button
{
  "mcpServers": {
    "ontology-atlas": {
      "command": "/Applications/Ontology Atlas.app/Contents/MacOS/ontology-atlas-mcp",
      "args": [],
      "env": { "OATLAS_VAULT": "/absolute/path/to/vault" }
    }
  }
}
```

From a source checkout the same entry is `"command": "node"`,
`"args": ["/absolute/path/to/ontology-atlas/mcp/src/index.js"]`.

The running server advertises the current read/write inventory through
`tools/list`. Run `mcp-verify` for exact set parity and live vault proof; use
`mcp/README.md` for the per-tool contracts.

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

### ✅ Phase 1 — Identity alignment (UI) — merged, historical route record

1. ✅ `/` becomes the ontology hub (superseded: gateway without a vault; map when a vault is available)
2. ✅ New `/topology` route
3. ✅ Landing copy — "Codebase ontology that grows with AI"
4. ✅ Slim demo — 21 → 6 containers, ~50 flat projects, ~42 ontology nodes

### ⏸ Phase 2 — Self-hosting — DEFERRED, historical

`bin` + CLI packaging. This pre-GitHub-Pages Firebase deployment note is
superseded; the current static website host is GitHub Pages.

### ✅ Phase 3 — AI agent partner — merged

1. ✅ `mcp/` package — MCP server (`ontology-atlas-mcp`)
2. ✅ Runtime-advertised MCP inventory: connection/root/toolset proof, vault-scoped Git status/history and local snapshots, persisted Workshop context (`builder_context` compatibility operation), list/get/find/query/compile/validate/analyze/index reads, batch concept/relation writes, narrow relation removal/replacement, concept patch/reclassification, dry-run-first rename/merge/delete/absorb writes, project-source connect/disconnect, and project-meaning finalization. `tools/list` is the exact current set; `mcp-verify` checks it.
3. ✅ CLI command (`ontology-atlas`) — `node <checkout>/cli/src/index.mjs init <folder>` scaffolds the vault from a source checkout. The installed app `/docs` "Create starter seed" button is the no-terminal alternative. (npm publishing retired 2026-07-27; there is no `npx` channel.)
4. ⏸ Auto-generated AGENTS.md — DEFERRED (manual updates + dogfood vault cover this)
5. ✅ `docs/ontology/` dogfood vault — describes our own mental model, including agent-practice notes as document nodes (census: `node cli/src/index.mjs overview`)

### Agent practitioner concerns map

Ontology Atlas should not add AI-agent features because they look advanced. Each
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

### 🔁 Phase 4 — Shared decision atlas (v8 correction)

R11 decided that "developers are the primary users." That decision remains correct for **the narrow entry point** (called a wedge in this document) — because those who can actually keep the vault of truth up-to-date are developers and their agents.
However, using it to mean "the product's entire user base is only developers" is abandoned. Atlas should be a workbench where planners, marketers, C-level executives, decision-makers, developers, and AI agents **share the same ontology** to quickly communicate business core, capabilities, implementation evidence, and impact scope.

### ⏳ Phase 4 execution — Wedge + shared surface

1. ✅ CLI command expansion — 54 commands across vault scaffold, MCP verify, import, repo bootstrap, deterministic compile, relationship explanation, transitive reachability, relation preflight + write, agent handoff, live agent activity heartbeat, growth/maintenance queue, graph CRUD, and graph deep dive
2. ✅ AI agent dogfood cycle — Claude Code verifies codebase analysis + add_concept workflow via mcp (R12 + R14 meta-verification)
3. ⏳ 10-minute shared understanding loop proof — Verify if core grasp via `init → bootstrap → topology/ontology` → MCP answer quality improvement → agent sync proposal → git diff review → improved next planning/development work is visible within 10 minutes in a new repository. If this doesn't happen, it's still just well-made components, not a product.
4. ⏳ Stakeholder-readable topology proof — Verify if non-developers can explain "what the core domain/capability is, what proves its implementation, and where changes have impact" by looking at `/topology` (with its current map/detail surfaces).
4. ~~VSCode plugin~~ — Removed in R15. Reason: As people move to AI agent terminals like Claude Code / Codex daily, VSCode's own market share has decreased. Code↔ontology movement / backlinks / writing already have equal value via mcp + cli.

---

## 7. Historical mission transition

This section preserves an earlier positioning transition. The current mission
and identity live in `AGENTS.md`; neither statement below is current authority.

### Old mission (historical, superseded; not the current AGENTS.md contract)

> The user writes prose; the system extracts concepts, relations, evidence; humans review and approve; the result grows into three views (topology, tree, ERD).

### Later mission (historical, also superseded)

> **A repo-native memory layer for AI coding agents, backed by an ontology of one codebase.**
>
> - Humans: review and refine the repo-local memory as normal markdown/git diffs.
> - AI agents (Claude Code, Cursor, Codex): read, query, and propose updates via MCP or CLI.
> - Bootstrap and sync reduce manual ontology authoring; the graph is maintained as a side effect of real code work.
> - All inputs share one vault graph. The current read/inspect workbench is the
>   Topology map with its INDEX and detail surfaces; retired tree and ERD
>   descriptions are historical records, not current product surfaces.
> - Distributed as an installed workbench plus source-checkout CLI/MCP entry
>   points for terminal and AI-agent workflows; npm is not a distribution
>   channel.

What changed:

- Cloud-extraction promise ("AI extracts") → collaboration promise ("AI agent partners").
- Cost model — the cloud LLM cost disappears (Claude Code already covers user's LLM cost).
- Identity sharpened — not a generic ontology tool, but **a local-first memory layer for AI coding agents**.

---

## 8. Current completion bar

The direction is no longer waiting on a phase pick. The active bar is evidence:

- Installed macOS app launches and route-smokes the ontology workbench surfaces.
- Topology + INDEX is the read/inspect surface, contextual map writing is the
  frontmatter relation-write surface, and Insights is the five-question
  maintenance board.
- `/ontology` redirects to `/topology?index=expanded`; `/ontology/edit` and
  `/ontology/studio` redirect into `/topology` and translate legacy edit query
  strings. None of those redirects owns current chrome.
- Agent/CLI graph DB packs still expose health, scans, paths, relation checks,
  and explanation contracts without turning Insights into a query cockpit.
- CLI/MCP proof gates must stay runnable over `docs/ontology` before the goal is
  treated as complete.
