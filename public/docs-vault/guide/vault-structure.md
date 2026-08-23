# Vault Structure

A vault is simply a Markdown folder. The only special part is the frontmatter at the top of each file.

```markdown
---
uid: 01890f3e-7b5d-4c0a-8f14-123456789abc
kind: capability
slug: token-issue
title: Token Issuance
domain: auth
---

# Token Issuance

Issues a session token to users who have successfully logged in.
```

## uid and slug: Permanent Identity and Current Address

Every node has both identifiers.

| Field | Meaning | Can it be changed? | Primary Use |
|---|---|---|---|
| `uid` | Permanent identity of the node itself | **No** | MCP precise lookup, handoff, source, export URN |
| `slug` | Human-readable current address | Yes, via rename | File path, relationship values, URL, CLI graph commands |
| `title` | Name displayed to humans | Yes | Display, search, description |

`uid` is a **lowercase UUIDv4** issued only once when the writer creates a node.
It is not calculated from slug, title, or file path, nor is it reused for new nodes
copied from existing ones. `rename` and `reclassify` preserve the UID. `merge` preserves
the UID of the surviving node and records the absorbed UID in `merged_uids`, ensuring
lookups by the old UID still point to the same node.

```markdown
uid: 21890f3e-7b5d-4c0a-8f14-123456789abc
merged_uids:
  - 01890f3e-7b5d-4c0a-8f14-123456789abc
slug: token-issue
```

`merged_uids` is history specific to `merge_concepts`. Do not issue it manually or fix it via general patch. `validate` blocks UID duplicates, invalid formats, and self-referential survival UIDs as hard errors.

This specification follows [RFC 9562](https://www.rfc-editor.org/rfc/rfc9562.html), which defines random UUIDv4, and
[W3C JSON-LD 1.1](https://www.w3.org/TR/json-ld11/#node-identifiers), which requires JSON-LD node identifiers to be IRIs. When exporting, `urn:uuid:<uid>` is used, so changing the slug does not change the external identity.

### Converting an Existing Vault Without UIDs to v2

It does not modify files upon reading. From the Ontology Atlas source checkout root,
first preview the changes.

```bash
pnpm vault:migrate 2026-08-02-add-node-uids --vault /path/to/vault
```

After reviewing, apply them by adding `--write` to the same command. If there are uncommitted
Markdown files in git, conversion will be rejected, so you must commit or stash first. Valid existing
UIDs are preserved, but invalid or duplicate primary/merged UIDs fail before writing the first file.

## kind: What the file is

`kind` defines what the file is. It becomes more specific as you go down.

| kind | Meaning | Example |
|---|---|---|
| `project` | Top-level artifact | `auth-platform` |
| `domain` | Group of features | `auth`, `billing` |
| `capability` | A single consistent behavior | `token-issue` |
| `element` | Distinct implementation role realizing a capability | `jwt-signer` |
| `document` | Descriptive document bound to the graph | This guide |

## Relationships

People and tools read relationships with names like `contains`, `depends_on`, `broader`.
The canonical storage key for `depends_on` in Markdown frontmatter
is `dependencies:`.

```markdown
---
uid: 11890f3e-7b5d-4c0a-8f14-123456789abc
kind: capability
slug: token-issue
title: Token Issuance
domain: auth
dependencies: [jwt-signer, session-store]
---
```

**Project membership is not specified separately.** It is determined automatically by traversing the `contains` chain.
Writing only `domain: auth` automatically links to the project above it.
Relationship values can use slugs instead of UIDs, allowing people to read the graph just by opening the file. The rename tool atomically updates these relationship values as well.

## Names in Two Languages

Using `display_ko` / `display_en` renders the name appropriate for the screen language on maps and lists. `title` serves as the source of truth for search/matching and should not be changed.

**Fill in all languages used by the vault.** If only one side is filled, the original text will be exposed to users of the other language.

## Where to Place It

Typically, you place it within the repository you are managing. This way, code and meaning are committed together and reviewed simultaneously.

```
your-repo/
├── src/
└── docs/ontology/     ← Vault
    ├── project.md
    ├── domains/
    ├── capabilities/
    └── elements/
```

This repository does the same. It documents itself in `docs/ontology/`, and those files are used to build this product.

## The Vault is Files

The frontmatter is the vault. There is no separate approval process or sync button. Editing a file updates the graph directly. Even if an agent writes it, it appears as a `git diff`, and you can manually correct it if needed.
