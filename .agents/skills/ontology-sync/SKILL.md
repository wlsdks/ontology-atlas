---
name: ontology-sync
description: After a code change, sync the project's ontology vault — read what's already there, identify new capabilities / elements / domains introduced by the change, and write them back via the MCP server (or fall back to the CLI). Use this at the end of any task that introduces a new feature, refactors a module, or renames a unit. Skip when the change is purely a typo, style nudge, or test fixture tweak.
---

# /ontology-sync — keep the vault in step with the code

The vault under `docs/ontology/` (this repo's dogfood) — or the user's own
vault when one is selected — is the **shared mental model** between the
developer and the AI agent. When code grows or shifts, the vault has to
follow, otherwise the graph drifts and stops being a useful map.

This skill runs after a unit of code work (new feature, refactor, rename,
notable cleanup) and produces the corresponding ontology updates so the
human sees the change appear in their workbench.

## When to run

**Run when**:
- a new user-visible capability landed (login flow, checkout flow, …)
- a new concrete element landed (jwt-token, indexeddb-adapter, sigma-canvas, …)
- a domain was reshaped (auth → split into auth + session, …)
- a slug-level rename happened in code that should mirror in the graph

**Skip when**:
- the change is a typo, comment tweak, or single-line style nudge
- the change is purely test fixture / lint config / docs prose
- the change reverts something already in the graph

## Workflow

The MCP server `oh-my-ontology-local` (or the published `oh-my-ontology-mcp`)
is the primary path. Fall back to the `cli/` binary (`oh-my-ontology add` /
`import` / `validate`) if MCP is unavailable in the current session.

### 1. Read what's already there (cheap)

```
list_kinds                                # how many of each kind
list_concepts                             # full node table (paginated)
get_concept(slug)                         # for any node you might extend
find_backlinks(slug)                      # before renaming or merging
```

Don't write anything before reading. The vault often already has the node
under a different slug (e.g. `capabilities/auth-login` vs
`capabilities/login`); duplicating is the worst failure mode here.

### 2. Look at the actual code change

Use `git diff` and the conversation context to identify, for the unit of
work just completed:

- **new capabilities** — user-visible features added
- **new elements** — concrete pieces (libraries, schemas, helpers, files)
- **new domains** — only if a whole new functional area opened up
- **edge changes** — `dependencies`, `relates`, `contains` arrays that
  should now point somewhere new

If the diff is large, ask: "what would a teammate need to know is now
*part of* this codebase that wasn't yesterday?" That's the ontology
delta — most diffs add 0–2 nodes; very few add 5+.

### 3. Write back

For each delta, prefer one tool:

| Situation | Tool |
|---|---|
| New node | `add_concept` (frontmatter is auto-normalized to the per-kind shape — slug, kind, title, then arrays/domain — so don't hand-shape it) |
| Existing node, new field or refined body | `patch_concept` (pass `expected_mtime` from a prior `get_concept`) |
| Slug rename in code → mirror in graph | `rename_concept` (dry-run first; commit with `confirm: true`) |
| Two near-duplicates collapse | `merge_concepts` (dry-run; commit with `confirm: true`) |
| Edge between existing nodes | `add_relation(from, to, type)` |

`add_concept` returns `warnings: ["expected field \"domain\" missing for kind \"capability\""]` when a strongly-expected field is absent. Treat that as a follow-up `patch_concept` to fill it in, not a hard error.

### 4. Verify

```
list_kinds                                # the count moved as expected
find_orphans                              # nothing got accidentally orphaned
```

If the vault is the user's own (selected via the web `/docs` picker), the
web's polling layer will pick up the changes within ~5 seconds — the
human sees new nodes pulse and a toast appear without reloading.

## Reply shape

Five lines max. Cover:

1. What you read (`list_kinds` summary or the slug you focused on).
2. What you added — slug + kind + parent.
3. What you patched / renamed — old → new.
4. Any `warnings` returned (and whether you'll address them in a follow-up).
5. Verify line — node count delta, orphan count delta.

Don't paste the full frontmatter back; the workbench shows it. The reply
is a changelog.

## Failure modes worth catching

- **Duplicate slugs**: `add_concept` throws on duplicate. Switch to `patch_concept`.
- **Dangling parent**: `domain: domains/foo` where `domains/foo.md` doesn't
  exist. Either add the parent first, or accept the
  `missing-expected-field` warning and tell the human.
- **Concurrent edits**: every write tool accepts `expected_mtime` from
  `get_concept`. Use it on `patch_concept` / `rename_concept` /
  `merge_concepts` / `delete_concept` so a parallel human edit isn't
  silently overwritten.
- **Backlink rot**: after `rename_concept`, the tool atomically rewrites
  every backlink. Don't do `find_backlinks` + N `patch_concept` manually.

## Example one-liner the agent might generate

> Read 13 nodes (5 capability / 3 domain / 4 element / project / readme).
> Added `capabilities/password-reset` (parent `domains/auth`) and
> `elements/password-reset-token` (linked as its element).
> No patches, no renames. No warnings. find_orphans: unchanged.
