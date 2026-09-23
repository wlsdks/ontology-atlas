# Ontology Atlas

**Understand what your codebase builds, why it is structured that way, and what a change may affect.**

[Download the desktop app](https://ontologyatlas.com/en/download/) · [Explore the web example](https://ontologyatlas.com/en/topology/) · [Read the guide](https://ontologyatlas.com/en/guide/) · [See the source](https://github.com/wlsdks/ontology-atlas)

This repository is the **1.3.0 source tree**. The [download page](https://ontologyatlas.com/en/download/) and [GitHub Releases](https://github.com/wlsdks/ontology-atlas/releases) show what is published now; a source change or web example in this README may reach those surfaces later.

## The problem Atlas addresses

A coding agent can finish a change before the next person has reconstructed what the code means. A changed-file list shows where it worked. It does not explain the capability those files serve, why a boundary exists, or which conclusions are still uncertain.

Atlas keeps a reviewed **codebase ontology** in ordinary Markdown alongside the code. A project contains domains, capabilities, and implementation elements; documents can describe any of them. Typed relations, source paths, citations, and explicit unknowns let a person or agent find the same meaning and question it. Git carries accepted edits with the implementation.

The map is a way to inspect those files, not a second database. Structural reachability is not a verified runtime blast radius, and a source path is evidence to inspect, not proof that a written claim is true. A person remains responsible for accepting or correcting meaning.

An MCP connection does not make every agent use a task brief automatically; the agent and the person must still inspect the relevant source and evidence.

## Explore the connected Online Store example

The web workbench can open a fictional Online Store without access to your files. Its **277 ontology documents** feed the map and Analysis. The Library uses its usual index, relation graph, and reader to connect four example wiki pages with their cited sources and related concepts.

| Go to | What you can inspect | Boundary |
| --- | --- | --- |
| [Map](https://ontologyatlas.com/en/topology/) | The Online Store's project, domains, capabilities, elements, and relations | Sample facts are fictional and read-only |
| [Analysis](https://ontologyatlas.com/en/ontology/insights/) | Counts, relationships, and review prompts over the same selected sample | Graph measures are not accepted product meaning |
| [Library](https://ontologyatlas.com/en/library/?tab=wiki) | A wiki page, its cited source, and a link back to its concept | Four source/wiki pairs are examples, not imported user documents |
| [Git](https://ontologyatlas.com/en/git/) · [Agents](https://ontologyatlas.com/en/agents/) · [Automations](https://ontologyatlas.com/en/automations/) | Labeled interactions that explain how those areas work | The browser does not run Git, launch an agent, or execute a schedule |

Try this path: open the map, choose the Library's wiki tab, open **Checkout and coupon responsibilities**, follow its cited policy source, then return to the linked Checkout capability. The Library page keeps the same index, graph, and reader shape used for real documents.

On the web, you may also choose a local folder through a supported browser's File System Access picker. When a folder is active, its Markdown replaces the sample as the source of truth. The installed app opens your own folder; it does not start in the bundled sample. [Surface details](docs/FEATURES.md#1-mode-branching-data-source).

## Use it in the next task

1. **Install and open a folder.** In the desktop app, choose a code repository or an existing Atlas folder. For a new ontology, Atlas shows the path before creating the **atlas/** folder inside the repository. Existing Markdown stays in place.
2. **Connect a coding agent.** The app's **MCP** area shows the configuration it will write for supported clients. Restart the client and run the live connection check; a config file alone is not proof that an agent can read the vault. [MCP setup](mcp/README.md#quick-start).
3. **Ask about a task.** With a populated vault, the agent can request a compact task brief through the **agent_brief** operation of **query_ontology**. It gets bounded concepts, evidence, dependencies, unknowns, and follow-up reads. It still needs to inspect source and verify its code.
4. **Review the result.** Use Map, Architecture, Library, Analysis, and Git History to inspect the claim and its evidence. Review proposed ontology writes before keeping the Markdown change with the code. Accepting meaning, reviewing code, merging, and deploying are separate decisions.

A typical folder has this shape:

~~~text
your-repository/
├── src/
├── package.json
└── atlas/
    ├── project.md
    ├── domains/
    ├── capabilities/
    ├── elements/
    ├── sources/
    ├── wiki/
    └── .ontology-atlas/   local audit and workspace data
~~~

The ontology is not required to describe every symbol. Give a node to something that helps a person understand a capability, a boundary, a change, or the proof to run. Raw documents under **sources/** remain as received; wiki pages cite them; typed ontology files supply the graph. [What becomes a node?](docs/guide/what-becomes-a-node.md) · [Vault specification](docs/ONTOLOGY-ATLAS-SPEC.md).

## What the installed app adds

The macOS app is the full local workbench. Its **Agents** screen finds supported coding tools installed on that Mac and can open an in-app conversation. The **MCP** screen handles this folder's agent connection and optional external connectors. The **Git** screen reads the folder's actual history. The **Automations** manager can schedule reviewed local work: Ontology reviews remain read-only, while document rounds retain their approved Library scope. [Feature inventory](docs/FEATURES.md).

**Jev is a separate, optional Agents tab on macOS.** Save your own TypeSafe API key in that Mac's Keychain, enter a specific claim and an evidence passage, inspect the exact request preview, and choose **Send to Jev**. The answer is advisory. Atlas writes a local transfer-metadata receipt but never changes or accepts vault meaning because of the answer. The browser's Agents example neither stores a key nor calls Jev. A source-only synthetic probe and its offline tests are available in the [Jev evidence-check guide](docs/guide/external-judgment.md).

The client code uses TypeSafe's documented HTTP API without a bundled credential or vendor SDK. TypeSafe's agreement permits Customer Application integrations under its terms but does not explicitly settle every independently keyed open-source distribution case. The guide links the terms and explains why written confirmation is appropriate before representing that distribution as contractually cleared.

| Capability | Installed macOS app | Browser workbench |
| --- | --- | --- |
| Open and inspect a local Markdown vault | Native folder bridge | File System Access where the browser supports it |
| Map, Library, Analysis, and read-only sample | Your chosen vault | Chosen folder or a labeled sample |
| Git history and agent runtime | Live local integrations | Labeled examples only |
| Jev evidence check | Explicit send with a Keychain-held key | No Jev connection or key storage |
| Scheduled local work | Reviewed app workflows | Example walkthrough only |

Windows x64 is offered as an **unsigned beta** when listed on the [download page](https://ontologyatlas.com/en/download/). SmartScreen may warn about an unknown publisher, and a managed PC may refuse installation. Check that page for the current platform, signing, checksum, and release facts. Other platforms can use the browser workbench or run the CLI and MCP server from source.

## A small, inspectable data contract

One Markdown file is one node. Frontmatter holds typed facts; its body explains what a person should judge.

~~~yaml
---
uid: 71890f3e-7b5d-4c0a-8f14-123456789abc
slug: capabilities/token-issue
kind: capability
title: Token issue
domain: domains/auth
path: src/auth/token-service.ts
elements:
  - elements/jwt-signer
dependencies:
  - capabilities/session-refresh
---

Issues access and refresh tokens for authenticated users.
~~~

The **uid** remains stable across renames. A **slug** names an ontology node; **path** names code. Directed dependencies and symmetric relations are different claims. Validation catches broken references, and rename or merge operations require a reviewed dry run and confirmation. The five authorable node kinds are project, domain, capability, element, and document. [Schema and relation guide](docs/guide/relations.md).

The same files serve the app, the [stdio MCP server](mcp/README.md), and the [local CLI](cli/README.md). JSON-LD and GraphML export use the compiled graph for other tools; export does not turn Atlas into an RDF reasoner.

## Trust and limits

- **Local files are the source of truth.** Atlas has no account or hosted vault backend. The web app is a static export; the browser retains only a vault handle in IndexedDB. The desktop app and source CLI/MCP read the folder directly.
- **Transfers are explicit.** A coding agent talks to its own provider when you ask it to. Optional Jev sends only the claim and passage you preview after you press Send. Connector secrets and the Jev key use the macOS Keychain.
- **Agent output remains reviewable.** A successful tool call, healthy graph, or advisory judgment does not accept meaning. Atlas MCP writes wait for one-time allow or reject review where the host supports that flow; other host permissions still matter.
- **Impact is bounded.** Graph reachability and blast-radius views follow declared edges. Missing or stale edges must remain visible as uncertainty, not become a claim of safety.
- **The main research risk remains open.** Reliable meaning reconstruction from unfamiliar repositories, a complete task-bound Meaning Diff, and better decisions in later independent tasks still need stronger evidence.

An early paired benchmark initially overstated Atlas's answer-quality advantage because its answer key favored Atlas's own concept names. After correcting that comparison, the measured answer-quality lift is **not established**; the repeatable result was narrower: Atlas can supply stable concept addresses for later lookup, at additional time and maintenance cost. [Findings and correction](docs/benchmark/FINDINGS-2026-08-31-metric-split.md) · [quality authority map](docs/ONTOLOGY-QUALITY.md).

## Run from source

This checkout requires **Node.js 24** and **pnpm**. Install the root dependencies and, when using the source MCP server, its separate dependencies:

~~~sh
pnpm install
pnpm --dir mcp install --frozen-lockfile
pnpm dev
~~~

The web development server is for the browser workbench. Open the installed app to inspect native Agents and Jev behavior. The repository intentionally exports static pages and has no API routes, server actions, backend, login, or npm package. [Source setup](cli/README.md#set-up-from-a-source-checkout) · [architecture](docs/ARCHITECTURE.md).

Contributors should start with [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md). Run **pnpm checks:changed -- --run** for the files you change and **pnpm knip** to audit unused code. Open pull requests as drafts and use **pnpm pr:land** for the reviewed merge. Keep visual review captures outside the repository.

## More detail

[Features](docs/FEATURES.md) · [MCP tools and setup](mcp/README.md) · [CLI commands](cli/README.md) · [Security](SECURITY.md) · [Product direction](docs/PRODUCT-DIRECTION.md) · [Architecture](docs/ARCHITECTURE.md) · [Decision records](docs/records/README.md) · [Development checks](docs/DEVELOPMENT-CHECKS.md)

## License

[MIT](LICENSE)
