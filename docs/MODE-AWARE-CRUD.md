# Mode-aware CRUD pattern

> **Status**: Adopted (Phase 2-3, 2026-05-01).
> **Why**: Root cause #1 from the planner audit — *no mode-aware hook existed, so every gate looked only at auth role*. Non-logged-in users with an active local vault could not perform mutations.
> **Spec location**: *Code-layer implementation* of the `.claude/rules/local-first.md` charter and `docs/LOCAL-FIRST-SYNC.md` § "Operational modes".

This document describes a pattern where *which entity accepts mutations follows a different flow depending on the user's source-of-truth mode*. When you add mutations to a new entity, follow this guide to make it mode-aware.

---

## 1. Operational modes (data source mode)

Of the four modes defined in `docs/LOCAL-FIRST-SYNC.md` §2, this pattern covers:

| Mode | Source of truth | Mutations allowed? | Auth required? |
|---|---|---|---|
| **static** | `data/manifest.json` (build-time) | ❌ no-op + reject | — |
| **local** | `.md` files on the user's disk (vault) | ✅ direct disk writes | ❌ no login needed |
| **cloud** | Firestore `*` collections | ✅ Firestore writes | ✅ Firebase Auth |

(hybrid is a separate spec, v1.0+.)

---

## 2. Core modules introduced

### 2.1 Hook that observes the mode itself

- `src/shared/lib/data-source-mode.ts` — pure function `getDataSourceMode({vaultLoaded, isAuthenticated}): DataSourceMode`. Priority: vault loaded > authenticated > static.
- `src/features/data-source-mode/model/use-data-source-mode.ts` — hook composing `useUserAuth` + `useLocalVault`. Exposes `window.__ohMyOntologyMode` for debugging.

### 2.2 Per-entity mode-aware mutation hooks

- `src/features/project-data-source/model/use-project-mutations.ts` — Project create/update/delete + canCreate/canEdit/canDelete capabilities. The local branch uses `useLocalVault.createDoc` / `updateFrontmatter` / `deleteDoc`; the cloud branch uses the entity API.

### 2.3 entity ↔ frontmatter mappers

- `src/entities/docs-vault/lib/project-frontmatter.ts` — `projectToFrontmatter(project)` + `buildProjectMarkdown(project)`. Serialization utilities for local-mode mutations.

### 2.4 vault → ontology fast path

- `src/entities/docs-vault/lib/derive-ontology-from-vault.ts` — extracts stub nodes/edges from frontmatter `kind / capabilities / elements / relates / dependencies / domain`. A *fast path* that bypasses the review queue (mission v2 = frontmatter is self-approving).
- `src/features/vault-ontology/model/use-vault-ontology.ts` — hook composing useLocalVault + derive.
- `src/features/vault-ontology/model/use-ontology-insight.ts` — **new in mission v2**, mode-aware ontology insight. local: vault frontmatter stub conversion; cloud: knowledgePublic projection. The `/` ontology hub automatically switches to vault mode when a vault is active.

### 2.5 AI agent partner (new in mission v2)

- The `mcp/` package — a stdin/stdout JSON-RPC server based on `@modelcontextprotocol/sdk`. Lets AI agents (Claude Code, etc.) read/write vault `.md` files directly.
- 12 tools (read 8 + write 4): `list_concepts` / `get_concept` / `find_evidence` / `find_backlinks` / `find_path` / `list_kinds` / `find_orphans` / `query_concepts` (typed filter DSL) / `add_concept` / `add_relation` / `patch_concept` / `delete_concept`
- Registration: `.mcp.json.example` or `mcp/README.md`

---

## 3. How to make a new entity's mutations mode-aware

Example: assume you want to add mode-aware CRUD for a `Tag` entity.

### 3.1 Add frontmatter serialization for the entity

```ts
// src/entities/docs-vault/lib/tag-frontmatter.ts
export interface TagFrontmatterShape {
  slug: string;
  name: string;
  color?: string;
}
export function tagToFrontmatter(t: TagFrontmatterShape): Record<string, ...> { ... }
export function buildTagMarkdown(t: TagFrontmatterShape): string { ... }
```

Also decide where the local-mode `.md` will live (e.g. `tags/<slug>.md`).

### 3.2 Create a mode-aware mutation hook

```ts
// src/features/tag-data-source/model/use-tag-mutations.ts
export function useTagMutations(): TagMutations {
  const mode = useDataSourceMode();
  const vault = useLocalVault();

  const createTag = async (input: TagInput) => {
    if (mode === 'static') throw new Error(STATIC_REJECTION);
    if (mode === 'local') {
      const path = `tags/${input.slug}`;
      if (vault.fileHandles.has(path)) throw new Error('already exists');
      await vault.createDoc(path, buildTagMarkdown(input));
      return;
    }
    // cloud
    await cloudUpsertTag(input);
  };
  // ... updateTag / deleteTag follow the same branching
  return { createTag, updateTag, deleteTag, canCreate: mode !== 'static', mode };
}
```

### 3.3 Use the hook from UI components

```tsx
function TagCreateForm() {
  const { createTag, canCreate, mode } = useTagMutations();

  if (!canCreate) {
    return <p>Static demo mode. Open a folder or sign in first.</p>;
  }
  // ... form
  await createTag(input);
}
```

### 3.4 Gate on *mode*, not on *role*

❌ Wrong pattern (the issue the audit surfaced):
```tsx
const { canManage } = useScopedAccountAccess(); // = isLoggedIn
return canManage ? <CreateButton /> : null;     // local users get blocked
```

✅ Correct pattern:
```tsx
const { canCreate } = useTagMutations();        // = mode !== 'static'
return canCreate ? <CreateButton /> : null;     // local users work too
```

---

## 4. List subscribe should be mode-aware too (TODO — Phase 6+ follow-up)

Today only mutations are mode-aware. **Reads (subscribe)** still default to Firestore:
- `subscribeProjects(accountId, ...)` — looks at Firestore only.
- Result: when a local-mode user adds a new vault project, it doesn't appear in the list (vault manifest changes show up on a separate surface).

Recommended direction:
```ts
// src/features/project-data-source/model/use-projects.ts
export function useProjects() {
  const mode = useDataSourceMode();
  // mode === 'local' → run buildTopologyFromVault over useLocalVault().manifest projects/*.md
  // mode === 'cloud' → subscribeProjects (entity API)
  // mode === 'static' → static vaultManifest
}
```

Doing this lets *consumers use the same hook without knowing the mode*. Today, views call the entity API directly — this needs to be swapped out incrementally.

---

## 5. e2e test guidance

For each mode-aware mutation, write three e2e scenarios:
- **static**: calling createX is rejected (toast or throw).
- **local**: mock the vault picker so a vault is active → call createX → verify the `.md` is created on disk.
- **cloud**: sign in via the Firebase Auth emulator → call createX → verify the Firestore doc is created.

As of writing (2026-05-01), the local/cloud e2e scenarios are not yet implemented. Phase 6+ follow-up.

---

## 6. Related specs / rules

- `.claude/rules/local-first.md` — the charter
- `docs/LOCAL-FIRST-SYNC.md` — definition of the four modes + conflict model
- `docs/OFFLINE-FIRST-UX-FLOW.md` — UI flow guide (5-page gate classification §5)
- `docs/ONTOLOGY-MODEL-V2-DRAFT.md` — V1.x ontology evolution (V1.4 ActionType also gains a mode-aware capability)

---

## 7. anti-pattern catalog (regression guard)

Anti-patterns we found (and fixed) before adopting this pattern:

| ❌ | Fix |
|---|---|
| `const accountId = null; useScopedAccountAccess(accountId)` — always-null hardcode | Removed the `accountId` parameter (B4) |
| Firestore's raw `Missing or insufficient permissions` message leaked to the user | When accountId === null, skip the subscription itself + return an empty graph + loaded:true |
| `<PermissionGate>` blocked the entire page entry | Moved from entry gate to submit-time gate (Phase 3.2) |
| Entity API only had `upsertProject(input)` — no path outside Firestore | The caller (UI) branches via the mode-aware hook. The entity stays cloud-only, with the new hook acting as a wrapper. |

---

> **Bottom line**: mode-aware CRUD is *the code-layer expression of the local-first charter*. When you add mutations to a new entity, follow the four steps in §3 to make it mode-aware. Breaking this pattern regresses *non-logged-in + vault users back to a dead end* — a charter violation.
