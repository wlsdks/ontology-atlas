---
title: "Build the first map from your code"
doc_type: guide
status: current
area: product
---

# Build the first map from your code

Here you build the first codebase ontology for your repository: the domains,
capabilities and elements your code implements, and the relations between them.
A coding agent such as Claude Code or Codex reads the code over MCP and
proposes the map. You review it, and only what you approve is written.

## Who does what

Atlas does not turn your code into meaning on its own. The agent reads the
code, proposes concepts and relations with evidence, and writes the ones you
accept as Markdown in the ontology folder. Your code is only read, never
changed.

Repository scans give evidence, not answers. `analyze_repo_structure`,
`index_project` and `infer_imports` write nothing. A folder name or an import
line is something the agent observed. It is not yet a domain, a capability or
a dependency.

## Start in the app

The desktop app offers three ways to start.

**Build ontology from code.** On the start card, this button asks you to pick
your code folder. Atlas shows the path of the `atlas` folder it will create
inside that code folder (or reuses an existing one) and waits for you to press
**Create**. It then opens an agent chat with your coding agent, which reads the
code and writes a first map in one run. Each write asks for your approval.
With **Auto-approve** on, the agent still asks before it binds the code folder
and before it finishes the map.

**Getting started.** When you open a folder that has no map yet, a card on the
map walks you through a few steps. In a code folder, the first step is **Let an
agent draft the map from your code**. When a coding agent is ready in the app,
**Ask agent** puts the request into the agent chat beside the map, and you
press **Send** yourself. Otherwise, **Copy prompt** copies the same request for
the agent you run in your terminal. Later steps connect an agent and then
either create starter documents or let you start by hand.

**Build from code with a local model.** In the macOS app, the agent panel
beside the map has **Build from code**. It needs a local model server, such as
Ollama, LM Studio or llama.cpp, set up under **Agents** › **Models**. Pick a
code folder. A preview shows the code folder, where reviewed changes will be
saved, the model, its address and how many eligible files it found. **Run** sends
code excerpts only to that local address. The result is a list of proposed
document changes. Select the ones you want and apply them.

## Start from a terminal

With a source checkout of Atlas (see [the CLI](/guide/cli)), run this in your
own repository:

```bash
cd /path/to/your/repo
node ~/tools/ontology-atlas/cli/src/index.mjs init ./atlas
node ~/tools/ontology-atlas/cli/src/index.mjs bootstrap . --vault ./atlas
```

`init` creates the `atlas` folder with five starter files. It also writes the
agent configs `.mcp.json` and `.codex/config.toml`, and three starter skills
for Claude Code and Codex: `atlas-review`, `atlas-grow` and `atlas-absorb`. The
starter files show the shape of a concept. They are not an analysis of your
product.

`bootstrap` scans the repository and prints a review plan. It writes nothing
and exits with code 3 to say that approval is still needed. Restart your agent
in the repository and continue there.

## What to ask the agent

Keep the first map small. Pick one behavior you want to understand and ask
for that, for example:

```text
Build the first Atlas map of this repository, focused on [one behavior,
such as accepting an order].

Call connection_info first and confirm the ontology folder and the code
repository. Read list_kinds and the concepts that already exist, so you do
not add duplicates. Treat the starter files as examples, not as facts.

Read the entry point, its conditions and its failure paths. Propose a small
batch before writing. For each concept give a definition sentence, what it
includes and excludes, the file that implements it, and what you could not
check. For each relation, say why it holds.

Stop so I can correct or approve the batch. Then write only what I
approved and run validate_vault.
```

A handful of concepts is enough for a first pass. Add more when you have
another question to answer.

## Review before saving

A good proposal is specific enough that you can disagree with one claim at a
time. Check each concept and relation:

- **The name says what it does.** A folder or library name alone tells a
  teammate too little.
- **The body has all its parts.** A definition sentence, `## Includes`,
  `## Excludes` and `## Uncertainty`. `validate` warns when one is missing.
- **The evidence points at a file.** A capability or element has a `path` to
  the code. A path that exists does not prove the explanation, so open it.
- **The relation holds.** Ask whether the capability would still work without
  the target. An import alone does not prove a dependency.

Approve only a batch you have actually read, then ask for the next one. Once
the map has settled into shape, the agent can bind the project to the code
folder with `connect_project_source` and record the result with
`finalize_project_meaning`. A successful write still does not mean the meaning
is accepted: read the diff before you commit.

## Reuse CLAUDE.md and AGENTS.md

Your agent instruction files often describe the codebase already. `absorb`
turns them into concepts:

```bash
node ~/tools/ontology-atlas/cli/src/index.mjs absorb CLAUDE.md AGENTS.md --vault ./atlas
```

By default it only prints a plan. With `--write`, it saves policy and rule
sections as `document` concepts and backs up the original file as
`.pre-absorb.bak`. It then rewrites the original as a short pointer file that
keeps the sections it did not absorb. Architecture sections
are only proposed, never written automatically. Agents can do the same through
the MCP tool `absorb_document`.

`init` also prints a short paragraph for you to paste into your own
`CLAUDE.md` or `AGENTS.md`. It tells future agent sessions that the ontology
exists and when to read it. Atlas does not edit those files for you.

If the folder already holds Markdown documents that are not on the map, the
**Getting started** card adds a step, **Build the map from my documents**.

Next: [Reading the map](/guide/reading-the-map), and later
[Keep the map current as code changes](/guide/growing-vault).
