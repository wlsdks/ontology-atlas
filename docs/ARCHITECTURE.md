---
title: Architecture
tags: [architecture, infra, overview]
---

# Architecture

> This document describes the current product's domain model and its public/operational structure. The service is no longer a simple public portfolio — it is now built around growing a document-based ontology inside a workspace and reading/editing it from public surfaces.

## 1. Current product structure

```text
┌───────────────────────────────────────────────────────┐
│ Next.js static app (output: 'export')                │
│ ├─ /                     ontology tree hub (mission v2)│
│ ├─ /topology             Sigma WebGL topology         │
│ ├─ /projects             project list (mode-aware)    │
│ ├─ /project/[slug]       project detail (inline edit) │
│ ├─ /docs                 vault picker / docs surface  │
│ ├─ /ontology/edit        xyflow ERD builder           │
│ ├─ /ontology/insights    graph insights               │
│ ├─ /ontology/relations   relation distribution        │
│ ├─ /settings/*           categories / statuses / import│
│ ├─ /account              user account settings        │
│ └─ /login, /signup       Firebase Auth (optional)     │
└───────────────────────────────────────────────────────┘
                    ↓ Firebase Web SDK (optional)
┌───────────────────────────────────────────────────────┐
│ Firebase (optional — only when cloud sync is needed)  │
│ ├─ Firestore  (global + account scoped data)          │
│ ├─ Storage    (screenshots only)                      │
│ ├─ Auth       (email/password, Google)                │
│ └─ Hosting    (static site deployment)                │
└───────────────────────────────────────────────────────┘
                    ↑ separate trusted boundary
┌───────────────────────────────────────────────────────┐
│ MCP server (mcp/) — AI agent partner                  │
│ ├─ stdin/stdout JSON-RPC                              │
│ └─ vault frontmatter read/write (12 tools)            │
└───────────────────────────────────────────────────────┘
```

> **mission v2 alignment**: The cloud LLM extraction flow (`enqueueExtractionJob` / `processExtractionJob` / `applyReviewAction`, etc.) has been removed. AI extraction is now performed by user-side AI agents (Claude Code, etc.) writing directly to the vault through the MCP server. The Cloud Functions folder (`functions/`) has also been retired — both because of the no-firebase-deploy policy and because mission v2's vault self-approval makes server-side publish/promote/dismiss gates unnecessary.

## 2. Domain model

The product should now be described in terms of the model below.

- **Workspace (Account / Workspace)**: the top-level grouping of data and permissions
- **Global map**: a public surface that aggregates every project inside a workspace
- **Project list**: the hub for picking and starting a project
- **Project detail**: a surface for reading a project's internal connections and related documents
- **Project internals**: the area, node, and related-document layers that describe a project
- **Document operations**: registering documents, uploading versions, extraction, reviewing connections, and publishing

In other words, a `project` is the largest unit of work, and documents and nodes grow inside a project. Creating a new project from inside another project is the wrong context.

## 3. Data and permission boundaries

The essentials are:

- The browser does not write directly to backend-owned collections.
- Raw markdown is stored in Storage, not Firestore.
- The private approved graph and the public projection are separated.
- Globally public data and account-scoped data are separated.
- Public surfaces are read-by-default; for owners/editors, the same public surface flows directly into editing.

## 4. Responsibility split

### Next.js app

- Renders the global map, project list, and project detail
- Handles login/sign-up and workspace selection (cloud mode only — local-first works without auth)
- Provides inline editing on public surfaces for the owner/members (actions are revealed by permission on the same URL)
- Project detail (`/project/[slug]`) is the hub for all related work — jumping into the topology, viewing/editing related documents, and editing the project itself all happen on a single screen
- System settings under `/settings/*` (categories / statuses / import). The `/knowledge/*` document subsystem, `/review/*` review queue, `/diagnostics/*` operations panel, `/admin/*` namespace, and TBox surfaces (`/settings/ontology[/history]`) were all retired in mission v2 — vault frontmatter is the schema and is self-approving
- Public surfaces read the `knowledgePublic*` projection (cloud mode only); local-first surfaces read directly from the vault manifest
- Permissions are determined by Firestore rules plus client-side capability hooks. There is no separate "operator / administrator" role.

### Firestore / Storage (cloud mode only)

- Stores the canonical public-product data (projects, categories, statuses)
- Stores account-scoped projects
- Stores the canonical approved graph (`knowledgeApprovedNodes/Edges`)
- Stores the public projection (`knowledgePublicNodes/Edges`)
- Stores the publish event log (`knowledgePublishes`)
- Stores screenshots in Storage
- Cold storage only: legacy knowledge document / extraction / review collections retained but no longer written by any callable

### Cloud Functions

Retired. Reasons:
- No-firebase-deploy policy
- Mission v2's vault self-approval (publish projection gate not needed)
- The stub flow was a byproduct of cloud LLM extraction — once that disappeared, promote/dismiss became dead too

In earlier cleanup stages (PR #5/#6) the chunking / extraction / review seed / approval audit were removed; finally the `functions/` folder itself and the `functions` key in `firebase.json` were removed too. Some client-side `httpsCallable` code may still exist, but calling it on a deploy-less environment fails — with zero impact on the user flow (cloud mode is unused).

### MCP server (introduced in mission v2)

- **`mcp/` package** — `oh-my-ontology-mcp`, depends on `@modelcontextprotocol/sdk`, stdin/stdout JSON-RPC
- AI agents (Claude Code, Cursor, …) read/write vault `.md` directly
- 12 tools (read 8 + write 4):
  - read: `list_concepts` · `get_concept` · `find_evidence` · `find_backlinks` · `find_path` · `list_kinds` · `find_orphans` · `query_concepts` (typed filter DSL)
  - write: `add_concept` · `add_relation` · `patch_concept` · `delete_concept`
- Registration: see `.mcp.json.example` or `mcp/README.md`

## 5. Data boundaries

### Public read model

The data below is publicly readable.

- `projects`
- `accounts/{accountId}/projects`
- `categories`
- `statuses`
- `meta`
- `knowledgePublicNodes`
- `knowledgePublicEdges`

### Self-account private model (account owner / members only)

The data below is readable only by the account owner or a member of that account.

- `accounts/{accountId}/projects` — account-scoped project list
- Storage `screenshots/*` — uploaded project screenshots

> The legacy knowledge document collections (`knowledgeDocuments`, `knowledgeDocumentVersions`, `knowledgeReviews`, Storage `knowledge-documents/*`) were retired in mission v2 along with the `/knowledge/*` route surface. Existing rows remain in cold storage but no UI surface reads or writes them.

### Backend-owned model

The collections below are written by the backend; users only read them.

- `knowledgeApprovedNodes` — canonical from the manual editor or publish
- `knowledgeApprovedEdges` — V1.1 adds optional qualifiers + rank fields
- `knowledgePublishes` — publish event log
- `knowledgePublicNodes` — public projection
- `knowledgePublicEdges` — public projection (V1.1 fields-pass-through)

#### Cold storage (read-only after mission v2 cleanup)

The following are read-only after mission v2 cleanup since no callable writes them anymore:

- `knowledgeExtractionJobs` — extraction enqueue path is gone
- `knowledgeExtractionOutputs` — extraction worker is gone
- `knowledgeReviewEvents` — review queue page removed
- `knowledgeApprovalEvents` — applyReviewAction removed
- `knowledgeDocumentChunks` — chunking removed
- `knowledgeEvidence` — extraction worker is gone

## 6. Permission model

This product follows the Notion / Obsidian model. The owner of an account does every operation on that account themselves — there is no separate "operator / administrator" role. Membership is granted to other users only when collaboration is needed.

- **Guest**: arrives via a link and can only read
- **Logged-in user**: can perform every operation on their own account directly (projects, documents, system settings)
- **Member of another account**: a user with owner/editor membership in that account. Inside that account they have the same permissions as in their own
- **Viewer of another account**: a read-only member of that account
- **Global admin (`admins/{email}`)**: access to system-level data (global categories/statuses) and diagnostics tooling. Largely irrelevant for everyday use — within their own account, every user has full control of their own assets

The permission model no longer depends on URL namespaces (the old `/admin/*` is gone). Inline actions are revealed by permission on the same public surface; system settings live under `/settings/*`. The review-queue (`/review/*`) and diagnostics (`/diagnostics/*`) routes were retired in mission v2. The real permission gate is Firestore Security Rules.

## 7. FSD layer layout

```text
app/                 ← Next.js routing only (thin wrappers)
src/
  app/               ← FSD app layer (providers, initialization)
  views/             ← page components
  widgets/           ← composite UI blocks
  features/          ← user interaction units
  entities/          ← business entities
  shared/            ← reusable foundations
```

**Import direction**: `app → views → widgets → features → entities → shared`

Detailed rules: [`rules/architecture-fsd.md`](rules/architecture-fsd.md)

## 8. Pages and operational paths

| Path | Role | Access |
| --- | --- | --- |
| `/` | ontology tree hub (project → domain → capability → element) + search + ego graph (mission v2). Automatically uses vault frontmatter when the vault is active (Q1=(a)) | fully public |
| `/topology` | Sigma WebGL topology (exit view) | fully public |
| `/projects` | project list ("New project" button when permitted) | fully public |
| `/project/[slug]` | canonical route for a single project (inline editing when permitted) | fully public |
| `/project/new` · `/project/[slug]/edit` | project editor | editor or above |
| `/docs` | vault picker / docs surface when the vault is active | fully public (vault lives on the user's disk) |
| `/login` · `/signup` · `/reset-password` | Firebase Auth surface (cloud mode only) | fully public |
| `/account` | user's own account settings | logged-in user |
| `/ontology/edit` | xyflow ERD builder + frontmatter md export | editor or above |
| `/ontology/insights` | kind distribution / hub nodes / recent activity / orphans | viewer or above |
| `/ontology/relations` | edge-level view — filter and distribution by relation type | viewer or above |
| `/settings/categories` · `/settings/statuses` · `/settings/import` | categories / statuses / CSV import | editor or above |

> Retired after mission v2 cleanup (no UI, no callable, no rules): `/knowledge/*` (entire document subsystem), `/review/*` (review queue), `/diagnostics/*` (operations panel), `/admin/*`, `/settings/ontology[/history]` (TBox surface), `/settings/api-keys`, `/project/topology`, `/project/view`. The cloud LLM extraction flow (`enqueueExtractionJob` etc.) and the `functions/` folder itself are also gone.

> The permission model is decided by Firestore Security Rules and capability hooks rather than URL namespaces. Inline actions are revealed by permission on the same public surface.

## 9. Currently implemented vs planned

### Already implemented

- Global map / project list / project detail
- Public login / sign-up
- Account-scoped workspaces and membership (role: owner/editor/viewer)
- Quick edit flow for owners/editors on the public surface
- Project CRUD (mode-aware: local vault / cloud Firestore)
- Document registration / version upload / publish (cloud mode)
- vault frontmatter → ontology stub fast-path (mission v2)
- ontology v0: TBox seed (5 classes + 7 relations), `/` tree + ego graph, the `/ontology/edit` builder, `/ontology/insights` + `/ontology/relations`, manual editor direct writes
- V1.1 — Wikidata statement qualifiers + rank (optional fields, additive)
- AI agent partner (MCP server) — vault read/write through 12 tools (read 8 + write 4)
- dogfood vault (`docs/ontology/`) — our own mental model
- global admin whitelist

### Still in the planning stage

- V1.2 — literal properties (`knowledgeApprovedLiterals`)
- V1.3 — rich references (retrievedAt / extractionModelId / confidence)
- V1.4 — ActionType (Palantir-inspired, DEFERRED)
- V1.5 — relation cardinality
- V2 — unified KnowledgeStatement (RDF-star compatible)
- multi-vault — multiple vaults active simultaneously
- Phase 4 non-developer surface (per-kind icons, Korean mapping layer, etc.)

Details: `docs/BACKLOG.md` (T19-T38).

If a path appears in the docs but does not exist in the actual code, treat it as still in the planning stage.

## 10. Related documents

- [`PRODUCT-DIRECTION.md`](./PRODUCT-DIRECTION.md) — mission v2 direction
- [`FEATURES.md`](./FEATURES.md) — exhaustive list of features users can use *right now*
- [`BACKLOG.md`](./BACKLOG.md) — unified next-work (T28-T38)
- [`MODE-AWARE-CRUD.md`](./MODE-AWARE-CRUD.md) — local/cloud/static branching guide
- [`ONTOLOGY-MODEL-V2-DRAFT.md`](./ONTOLOGY-MODEL-V2-DRAFT.md) — V1.x → V2 spec
- [`MISSION-CLEANUP-CANDIDATES.md`](./MISSION-CLEANUP-CANDIDATES.md) — 4-stage cleanup progress (all done)
- [`DATA-MODEL.md`](./DATA-MODEL.md) — Firestore collections + Storage paths + Security Rules
- [`DESIGN-SYSTEM.md`](./DESIGN-SYSTEM.md) — design tokens / motion / forbidden patterns
- [`DEPLOYMENT.md`](./DEPLOYMENT.md) — Firebase deployment / rollback / domains
- [`CHANGELOG.md`](./CHANGELOG.md) — chronological user-visible changes
- [`../mcp/README.md`](../mcp/README.md) — MCP server 12 tools + registration
- [`../AGENTS.md`](../AGENTS.md) / [`../CLAUDE.md`](../CLAUDE.md) — agent / contributor guide
- [`../.claude/rules/`](../.claude/rules/) — granular working rules

## 11. Scaling triggers

- As the number of containers grows, reconsider the single canvas in favor of tab-splitting
- As the number of vault documents grows, evaluate fingerprint diff + worker separation
- As image / document uploads grow, revisit Storage lifecycle and region choices
