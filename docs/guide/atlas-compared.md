---
title: "Atlas compared with code graphs, wikis, note apps and CLAUDE.md"
doc_type: guide
status: current
area: product
---

# Atlas compared with code graphs, wikis, note apps and CLAUDE.md

Ontology Atlas records what a codebase is for and why, as reviewed Markdown in
the repository that you and your coding agent both read. Code graph tools
compute how the code is built. Wikis and note apps hold prose that does not know
when the code changes. `CLAUDE.md` and `AGENTS.md` hold the rules an agent
follows. This chapter compares Atlas with each of these and with
knowledge-graph databases, and says when the other tool is the better choice.

## At a glance

| Tool | Best at | Does not hold | With Atlas |
|---|---|---|---|
| Code graphs and code search | Exact structure: definitions, calls, imports | What a part is for, or why | Concepts cite code paths; agents use both |
| Repository wikis and docs sites | Long explanations for readers | Typed relations; any sign that the code changed | Wiki pages in the folder cite their sources by hash |
| Obsidian, Notion | Writing, capture, collaboration | Any link to the repository or its Git history | Obsidian can open the same folder |
| `CLAUDE.md`, `AGENTS.md` | Rules the agent loads every session | A map of the system | Atlas reads them and can turn their sections into concepts |
| Graph databases, RDF and OWL | Large data, query languages, inference | A place in your Git review | Atlas infers nothing and is not a database |

## Code graphs and code intelligence

Language servers, code search and code graph indexes are computed from the
source. They answer "where is this function called" or "what imports this
file" exactly, and they stay current because they are rebuilt from the code.
For those questions they are the better tool, and faster than Atlas.

They cannot say what a part is for, which product boundary it belongs to, why
two modules must change together, or what nobody has checked yet. Atlas
records those as concepts and relations that a person wrote or accepted. A
concept names its code in `path`, and in the desktop app the map marks it stale
when that code changed after the concept did. Atlas's `infer_imports` tool
reads static imports too, but returns them as review candidates, never as
accepted relations.

## Repository wikis and docs sites

A wiki or a docs site is the right place for long explanations, onboarding and
pages for readers outside the code. A wiki generated from a repository holds
what a program inferred, not what your team decided.

A wiki page does not know when the code or document it describes changes, and
its links carry no type that a program can follow. In Atlas, **Library**
keeps source documents in `sources/` and wiki pages in `wiki/`. A wiki page
cites each source with a hash of its content, so when a source changes, the page
is marked before you open it. A `document` concept can link a text to the concepts
it explains with `describes`.

## Note apps: Obsidian and Notion

Obsidian is good at fast writing and linking in local Markdown, with plugins
and mobile apps. Notion is good at shared team workspaces and databases. For
daily notes, capture on a phone or live collaboration, use them.

Neither knows your repository or its Git history, so a note never shows that
the code it describes has changed. The ontology folder is plain Markdown with
YAML frontmatter, so Obsidian can open the same folder and you can write there.
Atlas skips folders whose names start with a dot, so it never reads Obsidian's
`.obsidian/` settings. Two limits: Atlas resolves a `[[...]]` link by its path
from the folder root, not by note name as Obsidian does, so some Obsidian links
do not resolve in Atlas. And editing in Atlas is plain text.

Atlas does not sync with Notion. In the desktop app, **Bring from a service**
in **Library** asks a connected agent to copy Notion pages into
`sources/notion/` as source documents.

## Agent instruction files: CLAUDE.md and AGENTS.md

The agent loads `CLAUDE.md` and `AGENTS.md` at the start of every session.
They are the right place for build commands, conventions and what an agent must
not do. Because they are read every time, they must stay short, so they cannot
hold a map of the system, which code implements which capability, or when that
changed.

Atlas works with these files in three ways. An ontology folder that Atlas
creates carries its own `AGENTS.md` and a `CLAUDE.md` that imports it, telling
agents to ask the Atlas MCP server before they scan files. An agent's
`absorb_document` tool turns sections of your existing files into concepts
([Build the first map from your code](/guide/from-your-repo)). And the app's
**Harness** tab reads these files without changing them and flags problems,
such as a `CLAUDE.md` that does not import `AGENTS.md`, or an `AGENTS.md` over
Codex's default 32 KiB limit.

Keep rules in the instruction files and the meaning in the ontology folder.

## Knowledge-graph databases, RDF and OWL

A graph database such as Neo4j stores large graphs and answers ad hoc queries
in a query language, for many users and services at once. RDF and OWL are
standards for sharing data across organizations and for inferring new facts
with a reasoner. For millions of facts or formal reasoning, use them.

Atlas is not a database. Its graph is the files in your folder, reviewed in Git
with the code. It has no query language: the MCP tool `query_ontology` answers
a fixed set of questions, such as `path`, `impact` and `blast_radius`. Atlas
infers no relation that nobody wrote, makes no RDF or OWL conformance claim,
and exports to neither. The frontmatter is plain YAML that a script can read.

## Read next

- [What is an ontology?](/guide/what-is-an-ontology): the idea behind the map.
- [Getting started](/guide/first-five-minutes): open or create your ontology
  folder.
- [Keep the map current as code changes](/guide/growing-vault): how stale
  concepts are found.
