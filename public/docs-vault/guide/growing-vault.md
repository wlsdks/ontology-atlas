# After the Vault Grows

Twenty nodes is no problem. Problems arise when you reach two hundred, three people start using it together, and agents add several items daily.

> I think I made the same thing twice, but where is it? If I rename this, what breaks? How do I know what needs fixing now?

This chapter covers what happens next.

## 1. The Most Common Failure is Duplication

The primary failure mode as the vault grows is **creating the same concept twice**. If "User Authentication" and "Login Processing" exist separately, their relationship splits, and no one knows which to consult.

**Ask before creating.**

```bash
node cli/src/index.mjs similar "map rendering" my-vault
```

```
similar to: map rendering — 3 matches

  1  0.158  element     elements/topology-map-v2      — Topology Map V2
       signals: title 0.09 · slug 0.07
  2  0.087  domain      domains/topology-navigation   — Topology Map Navigation
```

If it already exists, **fix the existing one** instead of creating a new one. Agents connected via MCP don't even need to call this separately; if a node with a similar title already exists, `add_concept` returns a warning along with the response.

If they've already split into two, merge them.

```bash
node cli/src/index.mjs merge capabilities/guided-tour capabilities/topology-browsing --vault my-vault
```

```
dry-run  capabilities/guided-tour → capabilities/topology-browsing
         (1 file(s) would change, capabilities/guided-tour.md will be deleted)

  domains/onboarding-and-shell — Onboarding, Distribution & App Shell
    capabilities changed

re-run with --confirm to apply.
```

**Dry-run is the default.** Review what changes first; execution requires adding `--confirm`.

Merging does not break the identity history. The remaining node's `uid` stays as is, while the disappearing node's `uid` and existing `merged_uids` are absorbed into the remaining node's `merged_uids`. Agent handoffs that stored the old UID still find the same node.

## 2. Renaming: Backlinks follow automatically

When renaming, the scary part is wherever that name was used. If you fix them manually, you will inevitably miss one.

```bash
node cli/src/index.mjs rename capabilities/guided-tour capabilities/tour --vault my-vault
```

```
dry-run  capabilities/guided-tour → capabilities/tour (1 file(s) would change)

  domains/onboarding-and-shell — Onboarding, Distribution & App Shell
    capabilities changed

re-run with --confirm to apply.
```

**Move the `.md` file and update all frontmatter pointing to its slug.** This includes keys in `relation_notes` attached to relationships.
The `slug` changes, but the `uid` does not. Because of this difference, agents, exports, and provenance history recognize the same concept even when the name and file change.

If you want to see the blast radius before renaming:

```bash
node cli/src/index.mjs backlinks capabilities/mcp-server my-vault
node cli/src/index.mjs blast-radius capabilities/mcp-server my-vault
```

`blast-radius` responds like this.

```
capabilities/mcp-server — blast radius (depth 2, incoming)
  risk medium · 6 nodes · 9 relations · 0 cross-domain

affected by kind
  capability 2 · element 2 · domain 1 · project 1
```

## 3. The queue tells you what to do next

Humans no longer need to visually scan to find "what needs fixing now."

```bash
node cli/src/index.mjs maintenance my-vault
```

```
maintenance plan — 8 remaining / 8 filtered / 8 total
summary: compileIssues:0, cycles:0, canonicalize:0, dangling:0, relations:0
buckets: phase review:8 · severity info:8 · kind capability_without_evidence:8

  [info] maint_b4dc8feb  review/capability_without_evidence · score 0.5
     The canonical `path:` for "capabilities/app-update" also lacks an actual element relation,
     so the vault cannot indicate where this behavior resides in the code. …
```

**Each row is one task**, and each row states what it should do in a sentence.
If there are too many lines, narrow them down.

```bash
node cli/src/index.mjs maintenance my-vault --kinds capability_without_evidence --limit 5
```

If you want to see where it can grow, `growth` is the pair. This one reports **missing connections** rather than faults.

## 4. Full health check

```bash
node cli/src/index.mjs health my-vault
```

```
vault health healthy — 70 nodes · 152 relations

  ✓ compile_issues            Compiled ontology artifact has no compiler issues.
  ✓ unresolved_edges          Every internal edge resolves to a known node.
  ✓ dependency_cycles         No directed dependency cycles were detected.
  ✓ relation_recommendations  No safe containment suggestions are pending.
  ✓ components                The actionable graph is connected.
  ✓ vault_validation          Vault schema and graph references validate cleanly.
```

The six checks name what they look for. You can view only what you need.

| Command | Question answered |
|---|---|
| `validate` | Do frontmatter and references hold? |
| `orphans` | Are there nodes pointed to by no one? |
| `cycles` | Do "required item" relations form a loop? |
| `components` | Is the graph split into islands? |
| `overview` | What shape is Vault currently in? |

`health` **compares against code paths**. `validate` looks only at frontmatter.
If a file cited as evidence disappears due to refactoring, `health` catches it.

## 5. Collaborative use

**Vault lives inside the repository, and the source of truth is files.** So no special collaboration mechanism is needed. You already have one.

- Concept changes appear as a single `.md` line diff. Review them together in code reviews.
- Conflict resolution is text conflict resolution. No special tools required.
- Reversion is done via `git revert`.

Before committing, to see what part of Vault this change affects:

```bash
node cli/src/index.mjs preflight --staged
```

Interprets staged files as Vault nodes and summarizes the impact. If nothing is affected, it passes silently.

If you want to commit only the vault:

```bash
node cli/src/index.mjs snapshot my-vault --dry-run
```

Creates a commit for the vault folder scope along with a summary of changes. If there are no changes, it says "No snapshot changes" and finishes.

## 6. When editing simultaneously: Preventing silent overwrites

If an agent writes to a file while a human is editing it in an editor, one side may disappear silently. The write tools have mechanisms to prevent this.

1. `get_concept` returns the file's `mtime` along with it.
2. Pass that value as `expected_mtime` when writing.
3. If the file has changed in the meantime, **it raises a conflict error instead of overwriting.**

If you plan to entrust your vault to an agent, it's good to know this one thing.
An incident where "the agent erased my edits" is prevented by this single value.

## 7. Deletion

```bash
node cli/src/index.mjs delete elements/old-thing --vault my-vault
```

**It rejects if backlinks remain.** If something is pointed to, deleting it would leave those references as ghost names. To truly delete, first clean up the pointing side, or use `--force` to override this judgment.

The default writer intentionally does not reissue deleted UIDs. However, since there is no separate tombstone ledger in the current scope, it can only check the current vault to prove if a human has manually reused a past UID. Querying a deleted UID will normally return `not found`. If you need to preserve history, use `merge` instead of deletion.

## Summary

- Duplicates are a single point of failure. Use `similar` before creation, or `merge` if already split.
- `rename` **rewrites all backlinks.** Do not fix them manually.
- `uid` is the permanent identity, `slug` is the mutable current address.
- `rename`, `merge`, `delete`, and `snapshot` are **dry-run by default**.
- Next steps: `maintenance`, areas for growth: `growth`, overall: `health`.
- The collaboration mechanism is **git itself**. Concurrent editing is protected only by `expected_mtime`.

The full list of commands is in [CLI](/guide/cli).
