---
title: "The ontology folder: Markdown files and their info block"
doc_type: guide
status: current
area: product
---

# The ontology folder: Markdown files and their info block

An Atlas ontology is a folder of plain Markdown files. Each concept in your codebase's knowledge graph is one `.md` file, and the YAML frontmatter at the top of that file says what the concept is and how it connects to others. This chapter shows that file format, the fields Atlas reads, and where the files go. There is no database behind it: the files are the ontology.

## One concept, one file

```markdown
---
uid: 7ec556ec-768d-40c3-8147-19db4287a338
slug: capabilities/token-issue
kind: capability
title: Token issuance
display_en: Token issuance
domain: domains/auth
elements: [elements/jwt-signer]
path: src/auth/issue-token.ts
dependencies: [capabilities/session-store]
relation_notes: { capabilities/session-store: "A token is only issued after the session is written." }
---

Issues a revocable session token after a successful sign-in.

## Includes
- Signing and returning the token.

## Excludes
- Checking the password, which belongs to credential verification.
```

The frontmatter is the graph: kind, name, parent and relations. The body is the meaning a person or an agent reads: a definition, what the concept includes and excludes, the evidence, and what is still uncertain.

## The fields

| Field | What it holds |
|---|---|
| `uid` | The permanent identity, a lowercase UUIDv4. It never changes. |
| `slug` | The readable current address, such as `capabilities/token-issue`. Relations point at slugs. It can be renamed. |
| `kind` | One of `project`, `domain`, `capability`, `element`, `document`. See [Choosing concepts](/guide/what-becomes-a-node). |
| `title` | The canonical name. Search and matching use it in every language. |
| `display_<locale>` | The name shown on a screen in that language, for example `display_en`, `display_ko`. |
| `display` | An optional short name for labels when `title` is long. |
| `description` | An optional one-line summary. |
| `domain` | The parent domain of a capability or element. Expected; a missing one is a warning. |
| `path` | For a capability or element, the one file or folder an unfamiliar reader should open first. |
| Relation keys | `domains`, `capabilities`, `elements`, `dependencies`, `relates`, `broader`, `contains`, `describes`. See [Relations](/guide/relations). |
| `relation_notes` | One sentence per relation saying why it holds, keyed by the target's slug. |
| `created_by` | Who created the file: `human`, or `agent:` followed by the agent's name. |
| `review_state` | Optional. `human_decides` marks a concept only a person may settle; `confirmed` records that a person checked the meaning. |

`uid`, `slug`, `kind` and `title` are required on every concept. A missing `domain` on a capability or element is a warning, not an error, so an unfinished folder still opens.

### Identity: uid and slug

The writer that creates a concept (the app, the MCP server or the CLI) mints its `uid` once. You do not choose it. Renaming a concept changes its `slug` and rewrites every relation that points to it, but keeps the `uid`. Merging two concepts keeps the surviving `uid` and records the absorbed one in `merged_uids`, so an old `uid` still finds the right concept. Do not write `merged_uids` by hand.

Use the slug when you write relations and links; it is what people read in the file. Use the `uid` when a tool or a handoff must point at the same concept even after a rename.

### Names in several languages

The map, lists and panels show `display_<locale>` for the screen's language when it exists, and fall back to the canonical name otherwise. `title` stays the same for every language, so search and matching do not depend on translation. If your team reads the map in two languages, fill in both names; a missing one shows the other language's name instead.

## Where the files go

Keep the ontology folder inside the repository it describes, so a code change and the matching meaning change can be reviewed in the same pull request. This repository keeps its own ontology in `docs/ontology/`.

```text
your-repo/
├── src/
└── docs/ontology/
    ├── project.md          the project (kind: project)
    ├── domains/            one file per domain
    ├── capabilities/       one file per capability
    ├── elements/           one file per element
    ├── sources/            raw source files, never concepts
    └── .ontology-atlas/    files the app keeps beside the ontology
```

Projects and documents sit at the root of the folder; domains, capabilities and elements sit in their own folders. By convention the file path mirrors the slug, but the `slug:` in the frontmatter is the address Atlas trusts. Under a kind folder a slug must be flat: `elements/jwt-signer`, never `elements/src/auth/jwt-signer`. The code location belongs in `path`.

Files under `sources/` are raw material, such as documents a wiki page cites, and are never read as concepts. `.ontology-atlas/` holds files the app writes beside your ontology, such as review results and the link to your code folder. When Atlas first writes that link, it also adds a `.gitignore` there so the folder stays out of Git.

To start a folder from the command line in a checkout of the Atlas source:

```bash
node cli/src/index.mjs init docs/ontology
node cli/src/index.mjs validate docs/ontology
```

`validate` reports broken references, unknown kinds and malformed identities. Most findings are warnings that do not stop you from working; a duplicate `uid` is an error. [The CLI](/guide/cli) lists the other commands.

## The files are the truth

Atlas reads the ontology from the files every time. Edit a file in your editor, through the CLI, or through an agent, and the map picks the change up within seconds. There is no sync button and no hidden state. Every change, including one an agent makes, is a line in `git diff` that you can review, keep or revert.

Next: [Choosing concepts](/guide/what-becomes-a-node).
