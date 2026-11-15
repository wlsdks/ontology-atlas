[English](README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [简体中文](README.zh.md)

<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/brand/lockup-dark@2x.png" />
    <img src="public/brand/lockup-light@2x.png" alt="Ontology Atlas" width="360" />
  </picture>
</h1>

<p align="center"><strong>Understand your system as AI agents change its code.</strong></p>

<p align="center">
  A map of what your code does and why, kept as Markdown in your repository<br />
  and read by both you and your coding agent.
</p>

<p align="center">
  <a href="https://ontologyatlas.com/en/download/"><strong>Download for macOS</strong></a> ·
  <a href="https://ontologyatlas.com/en/topology/">Try it in the browser</a> ·
  <a href="https://ontologyatlas.com/en/guide/">Guide</a>
</p>

<p align="center"><a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-5e6ad2.svg" /></a> <a href="https://github.com/wlsdks/ontology-atlas/releases"><img alt="Latest release" src="https://img.shields.io/github/v/release/wlsdks/ontology-atlas?color=5e6ad2" /></a> <a href="https://mcpservers.org/servers/wlsdks/ontology-atlas"><img src="https://mcpservers.org/badge.svg" alt="Listed on mcpservers.org" height="20" /></a> <a href="https://stackmap.shipwithai.xyz/repos/wlsdks/ontology-atlas"><img src="https://img.shields.io/endpoint?url=https%3A%2F%2Fstackmap.shipwithai.xyz%2Fapi%2Fbadge%2Fontology-atlas.json" alt="On StackMap" height="20" /></a></p>

![The Ontology Atlas map of this repository's own ontology with the Ontology Atlas project selected: its domains and capabilities laid out around it, a concept list on the left, and the project record with its code-evidence state on the right](docs/assets/readme/topology-overview.png)

## Why

Coding agents now change code faster than a team can keep a picture of it in
their heads. Atlas keeps that picture beside the code: what each part is for,
which files implement it, what depends on what, and what nobody knows yet. Your
agent reads it before a task and proposes updates after; you keep, correct or
reject each change as a Markdown diff.

- **Your agent starts with context.** Claude Code, Codex, Cursor and Antigravity read the concepts, code paths, dependencies and open questions a task touches, over MCP.
- **You own the record.** One Markdown file per concept in an `atlas/` folder, versioned and reviewed in Git like the code.
- **You decide what is true.** Agent proposals stay proposals until you accept them.
- **It says what it does not know.** A line on the map is a declared relationship, not proof of runtime impact; missing evidence shows as unknown, never as safe.

## See it

<table>
<tr>
<td width="50%"><img src="docs/assets/readme/neural.png" alt="Map, Neural view: the ontology drawn as a volume of lit clusters with one capability selected, and a panel naming what it depends on and what uses it" /><br /><b>Map · Neural</b> — the same concepts as a volume you can turn; select one to see what it depends on and what uses it.</td>
<td width="50%"><img src="public/gateway/projects.en.png" alt="Projects: one project's description, its domains as bars sized by the concepts they hold, and the capabilities inside the selected domain" /><br /><b>Projects</b> — what a project is for, how it divides into domains, and what each domain holds.</td>
</tr>
<tr>
<td width="50%"><img src="public/gateway/library.en.png" alt="Library: wiki pages on the left with whether each still matches its source, a search box in the middle, and the sources to read first" /><br /><b>Library</b> — documents in, cited wiki pages out; find a passage, then check it in the source.</td>
<td width="50%"><img src="public/gateway/planning.en.png" alt="Planning: a project folder's Markdown files listed on the left, one document open on the right" /><br /><b>Planning</b> — read a project folder's Markdown in place, without copying it.</td>
</tr>
<tr>
<td width="50%"><img src="public/gateway/changes.en.png" alt="Changes: one day of merged work with its count, the hours it was merged, and the changes grouped by scope" /><br /><b>Changes</b> — what was merged in a period, counted and grouped, with the pull requests, commits and files behind it.</td>
<td width="50%"><img src="public/gateway/git.en.png" alt="Git: the commit history on the left, and the concept one commit changed with its relations on the right" /><br /><b>Git</b> — each commit by the concepts it changed; an edited document shows up here before you commit it.</td>
</tr>
<tr>
<td width="50%"><img src="public/gateway/harness.en.png" alt="Harness: the files an agent reads, the rules that stop it before it acts and the checks that run afterwards, with one instruction file open" /><br /><b>Harness</b> — what an agent reads in your repository, what stops it before it acts, and what checks its work.</td>
<td width="50%"><img src="public/gateway/automations.en.png" alt="Automations: one scheduled document check with its cadence and last result, and the history of its runs" /><br /><b>Automations</b> — scheduled checks, and what each run found.</td>
</tr>
</table>

**New in v2.0:** Neural, a view of the map drawn as a volume you can turn, beside a 3D tree; Harness Setup, which lists what an agent reads, what stops it and what checks its work; a digest of merged work at the top of Changes; and the run history of every schedule in Automations. Analysis is no longer a separate destination. See the [releases](https://github.com/wlsdks/ontology-atlas/releases).

A few things worth knowing before you start:

- The map shows declared relationships, not proof of runtime impact. It has five views: Flat, Hex, Domain structure, a 3D tree and Neural. [Map](docs/features/map/README.md)
- An empty folder offers its start actions, and a failed start can be retried without overwriting files. Popup tours are retired. [First run](docs/features/first-run.md)
- Library setup and checks need the app; a browser offers the app or adding files. [Library](docs/features/library/workspace.md)
- Planning is read-only and works in the macOS app on a folder you choose; it shows Markdown and PNG/JPEG images. [Planning](docs/FEATURES.md)
- Git's send-only action does not commit new file changes; it asks you to review a stale folder or branch again. Pull can change files across the repository. [Git](docs/features/git.md)
- Changes opens a Git repository you choose in the app, with or without an ontology. Reading public GitHub pull requests is a separate, explicit step and its list may be incomplete; private pull requests are not read. [Change briefing](docs/features/change-briefing.md)
- A project document edited since its last meaning review asks for review and explicit re-finalization; saving a change or matching a code path does not accept its meaning. [MCP server](docs/features/mcp-server.md)
- In the app's chat, each agent write waits for your permission. Codex starts read-only, and its locally configured permission profiles are not offered because their approval behaviour is not disclosed. [Agents](docs/features/agents.md) · [Features](docs/FEATURES.md)
- Before a folder is connected, the app keeps Library, Planning, Agents and Changes reachable. [Features](docs/FEATURES.md)

## Quick start

1. **Install** the app from the [download page](https://ontologyatlas.com/en/download/), or open the [browser version](https://ontologyatlas.com/en/topology/).
2. **Open a folder.** Atlas reads its Markdown in place, or starts an `atlas/` folder in your repository, and shows the path before it writes anything.
3. **Connect your agent.** In **Agents › MCP**, press **Connect** for your tool, restart the agent, and ask about your next task.

macOS (Apple Silicon) is signed and notarized and carries the MCP server inside the app. Windows x64 is an unsigned beta. On Linux, use the browser version or run the [CLI and MCP server from a source checkout](cli/README.md#set-up-from-a-source-checkout). [Releases](https://github.com/wlsdks/ontology-atlas/releases) list each version's files and checksums.

## How it works

```text
your-repo/
├── src/
└── atlas/                 ← cloned, branched and reviewed with the code
    ├── project.md
    ├── domains/  capabilities/  elements/
    ├── sources/           documents kept exactly as they arrived
    └── wiki/              pages written from those sources, every fact cited
```

A Markdown file whose frontmatter has `kind:` is one concept. Its `uid` never
changes, its `slug` is its current address, and its `path` names the code it
describes. The map, documents, Library and Git screens all read these
files.

Your agent reaches the folder two ways:

- **MCP:** the agent starts the Atlas MCP server, which reads and writes the folder on disk, even with the app closed. [Connect an agent](docs/guide/connect-agent.md) · [MCP reference](mcp/README.md)
- **ACP:** Claude Agent and Codex also run in the app's own chat; each write waits until you allow it. [Agents](docs/features/agents.md)

## Local-first

- No backend, account or telemetry. The folder stays plain Markdown on your disk.
- Model calls with your API key or a local model are opt-in, and each records its destination in `.ontology-atlas/llm-audit.jsonl`.
- A connected coding agent may send your prompt and what it reads to its own provider; Atlas's log does not cover those transfers.

[Trust](docs/guide/trust.md) · [Security](SECURITY.md)

## Status

Atlas is early. Our benchmark has not yet shown better answers with Atlas, and
Atlas was slower ([the correction](docs/benchmark/README.md#current-measurement-status)).
Construction trials, their failures and limits are in
[the construction measurements](docs/benchmark/CONSTRUCTION.md).

## Documentation

[What is Atlas?](docs/guide/what-is-atlas.md) · [First five minutes](docs/guide/first-five-minutes.md) · [What becomes a node?](docs/guide/what-becomes-a-node.md) · [Relations](docs/guide/relations.md) · [Specification](docs/ONTOLOGY-ATLAS-SPEC.md) · [Features](docs/FEATURES.md) · [CLI](cli/README.md) · [Architecture](docs/ARCHITECTURE.md)

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md); external pull requests come from forks.
[AGENTS.md](AGENTS.md) is the contract for people and agents alike.

```bash
pnpm install
pnpm dev
pnpm checks:changed -- --run
```

`pnpm pr:land <number>` merges a reviewed pull request and keeps its original
commits. [Development checks](docs/DEVELOPMENT-CHECKS.md) covers choosing checks,
CI internals and lane budgets.

Pre-push checks the commit being pushed and runs affected lint, unit and Node
tests in parallel with the relevant cheap checks. CI owns browser, full contract
and dependency-graph verification. Test-only edits to CI tooling run their
regressions without starting unrelated product suites; changes to the planner
implementation still require exhaustive CI.

<details>
<summary><b>Repository commands</b></summary>

| Command | What it answers |
|---|---|
| `node scripts/ci/run-playwright-ci.mjs --help` | Browser shard options, without discovering or running tests; unknown options fail before execution |
| `pnpm agents:check` | Each harness's instruction files are valid; Codex and Claude files need not match |
| `pnpm brand:sprites` | Rebuild Moru sprites, 74 animation exports, 16 poses and compass sizes from retained project sources; inspect `assets/brand/moru/preview.html` |
| `pnpm brief:new -- --slug=<slug> --owns=<path,...>` | A delegation brief with the port, scratch, checks and merge lines filled in |
| `pnpm build:static` | Reuse `out/` only for matching build inputs; fail without a reuse stamp if inputs change during the build |
| `pnpm bundle:plan` · `pnpm bundle:prune` | Plan merging several branches as one, then prune the branches main contains (`/merge`) |
| `pnpm checks:changed` | Which gates this change needs |
| `pnpm conflicts:scan` | Which open pull requests change the same files as this branch, and whether a trial merge conflicts |
| `pnpm decisions:find <terms>` · `pnpm decisions:check` | The decision to cite or overturn, and whether this change owes one |
| `pnpm design:tokens -- [--prefix=<name>]` | The current token ramps, resolved from app/styles |
| `pnpm doc:new -- --type=<kind> --area=<area> --slug=<slug>` | A new living document from its template in `docs/.templates/` |
| `pnpm docs:check` | Docs gates, including `pnpm docs:language`, `pnpm source:language`, `pnpm changelog:check`, `pnpm dev-checks:check`, `pnpm docs:meta` |
| `pnpm docs:meta` · `pnpm doc:history -- <path>` | Every living document's kind, status and area; one document's commits across moves |
| `pnpm docs:move` | Moves the documents in `docs/.moved.json` and rewrites references (`-- --check` only reports) |
| `pnpm download:repo-facts` | Records this repository's star and fork counts, with the day read, for the download page's open-source section |
| `pnpm e2e:durations -- <timings dir>` | Rebalances the browser shards from downloaded `playwright-timings-*` reports |
| `pnpm e2e:sleeps:check` | Refuses a new fixed `waitForTimeout` without a `// measurement window:` note |
| `pnpm gates:yield -- --runs=200` | Which CI checks ever failed, per run, from the lane reports CI uploads |
| `pnpm gateway:capture -- --base-url=<static export>` | Re-shoots the app screens in `public/gateway/`, in Korean and English; `--only=map,neural` re-shoots this README's two map pictures |
| `pnpm harness:tokens -- --since=<date>` | Where Claude Code tokens went per agent type, from local transcripts, and which runs broke the compaction window or turn caps ([budget](docs/engineering/agent-effort.md#token-budget)) |
| `pnpm knip` | Dead files, exports and types |
| `pnpm licenses:check` · `pnpm notice:build` · `pnpm notice:check` | Shipped packages are on the license allow-list, and `NOTICE.md` is current ([rules](docs/engineering/third-party-code.md)) |
| `pnpm messages:build` · `pnpm messages:check` · `pnpm messages:adopt` | Compose `messages/<locale>.json` from one file per namespace, prove it current, and carry an old branch's edits |
| `pnpm messages:coverage -- --locale <code>` | Checks one locale's strings against `en`: arguments, plurals, script, keep-terms and typography |
| `pnpm perf:mcp:memory` · `pnpm perf:mcp:memory:check` | Whether the MCP server releases memory across repeated calls; about a minute |
| `pnpm pr:ci <n>` | Fire CI on a draft now |
| `pnpm pr:land --plan <n...>` · `pnpm pr:land --conduct` | Dry-run a merge, or merge queued pull requests until the queue is empty |
| `pnpm pr:land <n>` · `pnpm pr:queue` | Queue a pull request to merge (green ones merge together behind one CI run), and show the queue |
| `pnpm review:facts -- --base=<ref>` | The mechanical facts a reviewer would otherwise count by hand: line growth, 800-line files, export and dependency changes, untouched sibling tests, security paths |
| `pnpm seo:check` | After `pnpm build`: every sitemap URL in `out/` canonicalizes to itself, `/` and each locale root point at `/{locale}/download/`, and titles and descriptions are unique per locale |
| `pnpm typecheck` | Types across every file, with Next's generated route and page types |
| `pnpm ui:audit -- --url=<base> --route=<path> [--setup=<module.mjs>]` | Prepare an interactive state with an optional local module, then measure rendered facts per width: horizontal overflow, occluded or unreachable controls, small touch targets, off-ramp type/radius/shadow values, low contrast, unequal repeated sets, scroll-end reserve |
| `pnpm ui:look -- --route=<path> [--vault=fixture\|sample\|<dir>] [--widths=1440] [--audit]` | Builds and serves the static export on a free port (or uses `--url`), opens each route with a vault attached, and prints one screenshot path per route and width |

Use `--scope=<selector>` to audit one visible modal or region. The selector must match exactly one visible element; the report includes its measured element count.

</details>

## Moru

Moru is Atlas's pixel seal companion; the compass is the app identity. The repository includes [74 motions, 16 poses and their sources](assets/brand/moru/README.md): 58 drawn motions and 16 scenes composed from them. Open the [local motion studio](assets/brand/moru/preview.html) to play, pause and inspect every frame.

<p>
<img src="assets/brand/moru/animated/gif/authored/moru-wave.gif" width="128" height="128" alt="Moru greeting" />
<img src="assets/brand/moru/animated/gif/authored/moru-source-read.gif" width="128" height="128" alt="Moru reading source" />
<img src="assets/brand/moru/animated/gif/authored/moru-laptop-code.gif" width="128" height="128" alt="Moru coding on a laptop" />
<img src="assets/brand/moru/animated/gif/authored/moru-nose-balance.gif" width="128" height="128" alt="Moru balancing a star" />
<img src="assets/brand/moru/animated/gif/authored/moru-heart-gift.gif" width="128" height="128" alt="Moru offering a heart" />
<img src="assets/brand/moru/animated/gif/authored/moru-dance.gif" width="128" height="128" alt="Moru dancing" />
<img src="assets/brand/moru/animated/gif/authored/moru-pup-peek.gif" width="128" height="128" alt="Moru playing with a pup" />
</p>

**Where Moru appears.** At folder entry Moru greets you, holds out a small folder and waits; once a folder starts opening, play gives way to the waiting view. The download page has its own welcome. Reading a source, waiting for your permission and celebrating a finished check appear only when the app has observed that state, so Moru never shows progress nobody confirmed.

**Petting.** Press Moru for one short response. The first is gentle, the second reveals a playful one, and after that Moru works through everything it knows while avoiding the last two: 14 responses at folder entry, 18 on the download welcome. A small wordless bubble sometimes answers with a heart, a note or a sparkle, and a pup peeks out once in a long idle.

**Staying out of the way.** Moru moves only while airborne, and lands before it waits under your pointer. While work is pending it stays quiet and in place. Pause and resume live in Moru's menu (right-click or Shift+F10), with no playback button beside the character, and reduced motion answers with a still expression.

<img src="assets/brand/moru/moru-poses-showcase.png" width="400" height="400" alt="Moru's 16 poses" />

<details>
<summary>All 58 drawn motions</summary>

<p><b>Waiting</b></p>

<p>
<img src="assets/brand/moru/animated/gif/authored/moru-blink.gif" width="128" height="128" alt="Moru blinking while it waits" />
<img src="assets/brand/moru/animated/gif/authored/moru-tail.gif" width="128" height="128" alt="Moru wiggling its tail" />
<img src="assets/brand/moru/animated/gif/authored/moru-doze.gif" width="128" height="128" alt="Moru dozing" />
<img src="assets/brand/moru/animated/gif/authored/moru-hop.gif" width="128" height="128" alt="Moru doing a little hop" />
<img src="assets/brand/moru/animated/gif/authored/moru-tilt.gif" width="128" height="128" alt="Moru tilting its head curiously" />
<img src="assets/brand/moru/animated/gif/authored/moru-stretch.gif" width="128" height="128" alt="Moru stretching" />
<img src="assets/brand/moru/animated/gif/authored/moru-rest-return.gif" width="128" height="128" alt="Moru coming back from a rest" />
</p>

<p><b>Greeting</b></p>

<p>
<img src="assets/brand/moru/animated/gif/authored/moru-wave.gif" width="128" height="128" alt="Moru greeting" />
<img src="assets/brand/moru/animated/gif/authored/moru-soft-bow.gif" width="128" height="128" alt="Moru bowing softly" />
<img src="assets/brand/moru/animated/gif/authored/moru-hat-tip.gif" width="128" height="128" alt="Moru tipping a tiny hat" />
<img src="assets/brand/moru/animated/gif/authored/moru-flipper-five.gif" width="128" height="128" alt="Moru offering a flipper five" />
<img src="assets/brand/moru/animated/gif/authored/moru-shy.gif" width="128" height="128" alt="Moru smiling shyly" />
</p>

<p><b>At work</b></p>

<p>
<img src="assets/brand/moru/animated/gif/authored/moru-folder-open.gif" width="128" height="128" alt="Moru opening a folder" />
<img src="assets/brand/moru/animated/gif/authored/moru-folder-peek.gif" width="128" height="128" alt="Moru peeking into a folder" />
<img src="assets/brand/moru/animated/gif/authored/moru-source-read.gif" width="128" height="128" alt="Moru reading source" />
<img src="assets/brand/moru/animated/gif/authored/moru-search.gif" width="128" height="128" alt="Moru searching" />
<img src="assets/brand/moru/animated/gif/authored/moru-follow-link.gif" width="128" height="128" alt="Moru following a link" />
<img src="assets/brand/moru/animated/gif/authored/moru-compare.gif" width="128" height="128" alt="Moru comparing two things" />
<img src="assets/brand/moru/animated/gif/authored/moru-review-proposal.gif" width="128" height="128" alt="Moru reviewing a proposal" />
<img src="assets/brand/moru/animated/gif/authored/moru-await-permission.gif" width="128" height="128" alt="Moru waiting for a person" />
<img src="assets/brand/moru/animated/gif/authored/moru-uncertain.gif" width="128" height="128" alt="Moru unsure" />
<img src="assets/brand/moru/animated/gif/authored/moru-stop.gif" width="128" height="128" alt="Moru stopping" />
<img src="assets/brand/moru/animated/gif/authored/moru-retry.gif" width="128" height="128" alt="Moru trying again" />
<img src="assets/brand/moru/animated/gif/authored/moru-save.gif" width="128" height="128" alt="Moru saving" />
<img src="assets/brand/moru/animated/gif/authored/moru-refresh.gif" width="128" height="128" alt="Moru refreshing" />
<img src="assets/brand/moru/animated/gif/authored/moru-connect.gif" width="128" height="128" alt="Moru connecting" />
<img src="assets/brand/moru/animated/gif/authored/moru-reply-ready.gif" width="128" height="128" alt="Moru with a reply ready" />
<img src="assets/brand/moru/animated/gif/authored/moru-no-results.gif" width="128" height="128" alt="Moru finding nothing" />
<img src="assets/brand/moru/animated/gif/authored/moru-laptop-code.gif" width="128" height="128" alt="Moru coding on a laptop" />
<img src="assets/brand/moru/animated/gif/authored/moru-clap.gif" width="128" height="128" alt="Moru celebrating observed completion" />
</p>

<p><b>Feelings</b></p>

<p>
<img src="assets/brand/moru/animated/gif/authored/moru-thinking.gif" width="128" height="128" alt="Moru thinking" />
<img src="assets/brand/moru/animated/gif/authored/moru-pondering.gif" width="128" height="128" alt="Moru pondering" />
<img src="assets/brand/moru/animated/gif/authored/moru-hearts.gif" width="128" height="128" alt="Moru sending little hearts" />
<img src="assets/brand/moru/animated/gif/authored/moru-laugh.gif" width="128" height="128" alt="Moru giggling" />
<img src="assets/brand/moru/animated/gif/authored/moru-frown.gif" width="128" height="128" alt="Moru frowning thoughtfully" />
<img src="assets/brand/moru/animated/gif/authored/moru-grumpy.gif" width="128" height="128" alt="Moru with a tiny temper" />
<img src="assets/brand/moru/animated/gif/authored/moru-warm-temper.gif" width="128" height="128" alt="Moru blushing with a tiny temper" />
<img src="assets/brand/moru/animated/gif/authored/moru-heart-gift.gif" width="128" height="128" alt="Moru offering a heart" />
</p>

<p><b>Play</b></p>

<p>
<img src="assets/brand/moru/animated/gif/authored/moru-sing.gif" width="128" height="128" alt="Moru singing" />
<img src="assets/brand/moru/animated/gif/authored/moru-dance.gif" width="128" height="128" alt="Moru dancing" />
<img src="assets/brand/moru/animated/gif/authored/moru-chorus.gif" width="128" height="128" alt="Moru chorus" />
<img src="assets/brand/moru/animated/gif/authored/moru-flipper-groove.gif" width="128" height="128" alt="Moru dancing with its flippers" />
<img src="assets/brand/moru/animated/gif/authored/moru-somersault.gif" width="128" height="128" alt="Moru doing a somersault" />
<img src="assets/brand/moru/animated/gif/authored/moru-toy-fishing.gif" width="128" height="128" alt="Moru playing with a fishing-line toy" />
<img src="assets/brand/moru/animated/gif/authored/moru-fish-play.gif" width="128" height="128" alt="Moru and a fish" />
<img src="assets/brand/moru/animated/gif/authored/moru-magic-fish.gif" width="128" height="128" alt="Moru revealing a magic fish" />
<img src="assets/brand/moru/animated/gif/authored/moru-peekaboo.gif" width="128" height="128" alt="Moru playing peekaboo" />
<img src="assets/brand/moru/animated/gif/authored/moru-bubble-chase.gif" width="128" height="128" alt="Moru chasing a bubble" />
<img src="assets/brand/moru/animated/gif/authored/moru-nose-balance.gif" width="128" height="128" alt="Moru balancing a star" />
<img src="assets/brand/moru/animated/gif/authored/moru-star-sneeze.gif" width="128" height="128" alt="Moru sneezing sparkles" />
<img src="assets/brand/moru/animated/gif/authored/moru-friend-play.gif" width="128" height="128" alt="Moru playing ball with a friend" />
<img src="assets/brand/moru/animated/gif/authored/moru-pup-cuddle.gif" width="128" height="128" alt="Moru cuddling three pups" />
<img src="assets/brand/moru/animated/gif/authored/moru-pup-peek.gif" width="128" height="128" alt="Moru playing with a pup" />
</p>

<p><b>Scenes</b></p>

<p>
<img src="assets/brand/moru/animated/gif/authored/moru-rainy-day.gif" width="128" height="128" alt="Moru with an umbrella in the rain" />
<img src="assets/brand/moru/animated/gif/authored/moru-snow-day.gif" width="128" height="128" alt="Moru watching snowflakes" />
<img src="assets/brand/moru/animated/gif/authored/moru-breeze.gif" width="128" height="128" alt="Moru in a little breeze" />
<img src="assets/brand/moru/animated/gif/authored/moru-ontology-orbit.gif" width="128" height="128" alt="Moru watching a floating ontology model" />
<img src="assets/brand/moru/animated/gif/authored/moru-ontology-dance.gif" width="128" height="128" alt="Moru dancing with a floating ontology" />
</p>

</details>

## License

[MIT](LICENSE). Third-party notices are in [NOTICE.md](NOTICE.md), and the full license texts in [public/third-party-licenses.txt](public/third-party-licenses.txt). The pixel mascot and its sources are described in [Brand](docs/design/brand.md).
