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
- a revert leaves the existing graph accurate; otherwise inspect its semantic delta

## Workflow

The MCP server `ontology-atlas` (the compiled `ontology-atlas-mcp` binary
inside the installed app, or `mcp/src/index.js` from a source checkout) is the
primary path. Fall back to the source checkout CLI with
`node <atlas-checkout>/cli/src/index.mjs add|import|validate ...` if MCP is
unavailable in the current session. There is no npm-installed `ontology-atlas`
command to assume.

### 1. Read what's already there (cheap)

```
list_kinds                                # how many of each kind
list_concepts                             # narrow query for the changed domain/capability
get_concept({ slug }) or ({ uid })        # current address or permanent identity
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

Ordinary sync covers confirmed additions and patches within the authorized
scope. A proposed new meaning is not confirmed merely because code changed.
Reuse existing authorization only while its content and conditions still apply.

For each confirmed delta, prefer one tool:

| Situation | Tool |
|---|---|
| New node | `add_concept` (frontmatter is auto-normalized to the per-kind shape — slug, kind, title, then arrays/domain — so don't hand-shape it) |
| Existing node, new field or refined body | `patch_concept` (pass `expected_mtime` from a prior `get_concept`) |
| Edge between existing nodes | `add_relation(from, to, type)` |

Rename, merge, and deletion are separate procedures, not ordinary sync steps.
Require an explicit request covering the exact operation, perform its dry-run
or preflight review, then use the operation's concurrency guards. For rename
and merge, commit the reviewed operation with `confirm: true` only after those
conditions hold; a code rename alone does not authorize a vault rename.

`uid` is writer-owned permanent identity; `slug` is the readable current
address. Never mint, copy, or patch `uid` yourself, and never patch
`merged_uids` — only `merge_concepts` may extend that history. Report both
`{uid, slug}` for nodes that a later agent handoff must find, but keep relation
arguments and graph links slug-based. Rename/reclassify preserve UID; merge
preserves the target UID and absorbs the source identity history.

`add_concept` returns `warnings: ["expected field \"domain\" missing for kind \"capability\""]` when a strongly-expected field is absent. Patch only when the supported domain is already confirmed; otherwise report the missing evidence. A warning never authorizes inventing a domain.

### 4. Verify

Validate the vault and complete compilation, then follow the root `AGENTS.md`
meaning-finalization procedure: `finalize_project_meaning` judges
`agent_brief.meaningAssessment`. Report unresolved meaning separately from
successful writes; node and orphan counts alone cannot establish completion.

Supplementary checks:

```
list_kinds                                # the count moved as expected
find_orphans                              # nothing got accidentally orphaned
```

If the vault is the user's own (selected via the web `/docs` picker), the
web's polling layer will pick up the changes within ~5 seconds — the
human sees new nodes pulse and a toast appear without reloading.

## Reply shape

For routine success, use about five lines. Include additional lines when
needed to show an unresolved warning, exact approval scope, or verification
failure; brevity never hides a blocker. Cover:

1. What you read (`list_kinds` summary or the slug you focused on).
2. What you added — uid + slug + kind + parent.
3. What you patched / renamed — old → new.
4. Any `warnings` returned (and whether you'll address them in a follow-up).
5. Verify line — validation, complete compile, meaning assessment, and any count deltas.

Don't paste the full frontmatter back; the workbench shows it. The reply
is a changelog.

## Failure modes worth catching

- **Duplicate slugs**: read the existing node and compare its identity and meaning. Patch only if it is the confirmed target within scope; a collision alone does not authorize overwriting it.
- **Duplicate identities**: never copy `uid` into a new node. Validation and compilation fail closed on primary/merged UID collisions.
- **Dangling parent**: `domain: domains/foo` where `domains/foo.md` doesn't
  exist. Add it only if that parent is independently supported and approved.
  Otherwise report the unresolved parent and repair the proposal before writing.
- **Concurrent edits**: every write tool accepts `expected_mtime` from
  `get_concept`. Use it on `patch_concept` / `rename_concept` /
  `merge_concepts` / `delete_concept` (`merge_concepts` additionally takes
  `expected_into_mtime` to guard the survivor) so a parallel human edit isn't
  silently overwritten.
- **Backlink rot**: after `rename_concept`, the tool atomically rewrites
  every backlink. Don't do `find_backlinks` + N `patch_concept` manually.
- **Destructive boundary**: ordinary ontology-sync does not call
  `delete_concept`, `merge_concepts`, `rename_concept`, `absorb_document`, or
  `git_snapshot`. Those require an explicit user request, a dry-run or
  preflight review, and the relevant `expected_mtime` guards.

## Example one-liner the agent might generate

> Read 13 nodes (5 capability / 3 domain / 4 element / project / readme).
> Added `capabilities/password-reset` (parent `domains/auth`) and
> `elements/password-reset-token` (linked as its element).
> No patches, no renames. No warnings. find_orphans: unchanged.
