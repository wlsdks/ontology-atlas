import { stdout } from 'node:process';
import { COLORS } from '../colors.mjs';
import { CLI_COMMAND_COUNT } from '../cli-commands.mjs';

export function printHelp({ version, stream = stdout } = {}) {
  stream.write(`${COLORS.bold}ontology-atlas${COLORS.reset} ${COLORS.dim}v${version}${COLORS.reset}

AI-native codebase ontology workbench: ${CLI_COMMAND_COUNT} commands + MCP setup.

${COLORS.dim}Run it from an ontology-atlas source checkout: ${COLORS.reset}${COLORS.bold}node cli/src/index.mjs <command>${COLORS.reset}
${COLORS.dim}(The rows below shorten that to \`ontology-atlas <command>\`. There is no npm package —${COLORS.reset}
${COLORS.dim} the macOS app carries the MCP server in its own bundle instead.)${COLORS.reset}

${COLORS.bold}Usage:${COLORS.reset}
  ontology-atlas init [folder]                Scaffold a new ontology vault (default: ./atlas)
       --quick-start                          ${COLORS.dim}one-liner: + bootstrap + absorb suggestion + compact next steps${COLORS.reset}
       --documents                            ${COLORS.dim}a folder of documents, not a codebase: sources/ and wiki/ only, no map scaffolding${COLORS.reset}
  ontology-atlas install-shim                 Put ${COLORS.bold}atlas${COLORS.reset} on your PATH so it works from anywhere
       --dir path --force --uninstall --json  ${COLORS.dim}default ~/.local/bin · overwrite · remove · machine output${COLORS.reset}
  ontology-atlas list [vault]                 List ontology nodes in a vault
                                              ${COLORS.dim}--kind <kind>     filter by kind${COLORS.reset}
                                              ${COLORS.dim}--json            JSON output${COLORS.reset}
  ontology-atlas validate [vault]             Frontmatter + graph-reference check (source paths not read → health)
       --json --strict --fail-on=code,...     ${COLORS.dim}structured · warnings also fail · fail on chosen codes only${COLORS.reset}
       --list-codes                           ${COLORS.dim}the issue codes available to --fail-on${COLORS.reset}
  ontology-atlas wiki-validate [vault]       Wiki pages against the page contract (spec §11); exit 1 when one does not fit
       --json                                 ${COLORS.dim}per page: problem codes and their lines${COLORS.reset}
  ontology-atlas wiki-index [vault]          The wiki's index, computed from the pages: title, summary, sources, links, problems
       --json --write                         ${COLORS.dim}as data · also leave wiki/_index.md (generated, never edited)${COLORS.reset}
  ontology-atlas mcp-verify [vault]           MCP boot + tools + health + graph-query smoke
       --timeout-ms N                         ${COLORS.dim}large / slow vault server wait override${COLORS.reset}
  ontology-atlas agent-setup [vault]          Check/repair Claude Code, Cursor, and Codex configs
       --root path --write --json             ${COLORS.dim}existing vault setup, no starter files touched${COLORS.reset}
  ontology-atlas agent-files                  Read-only agent-file map + drift checks (repo root)
       --root path --json                     ${COLORS.dim}which tool reads which file · bridge/skill-copy/@ref/32KiB drift${COLORS.reset}
  ontology-atlas agent-activity [vault]       Write/show/clear the live Claude Code/Codex heartbeat
       --agent codex --state editing --json   ${COLORS.dim}.ontology-atlas/agent-activity.json${COLORS.reset}
  ontology-atlas add <kind> <slug>            Scaffold a new ontology node (.md)
       --title "..."                          ${COLORS.dim}required, non-empty${COLORS.reset}
       --domain X --path repo/path            ${COLORS.dim}optional parent + canonical code entrypoint${COLORS.reset}
       --body "..." --vault path              ${COLORS.dim}optional body + vault root${COLORS.reset}
       --raw-slug                             ${COLORS.dim}opt out of default kind→folder prefix${COLORS.reset}
  ontology-atlas find <query> [vault]         Search slug + title (case-insensitive)
       --kind X --json                        ${COLORS.dim}optional${COLORS.reset}
  ontology-atlas import <path...>             Import external .md into the vault (R14)
       --vault path                           ${COLORS.dim}target vault root (default: cwd)${COLORS.reset}
       --kind K                               ${COLORS.dim}fallback kind when input has no kind:${COLORS.reset}
       --raw-slug --rename --dry-run          ${COLORS.dim}no folder prefix · slug rename · plan-only${COLORS.reset}
  ontology-atlas absorb <file...>             ${COLORS.green}Absorb CLAUDE.md/AGENTS.md into typed vault nodes${COLORS.reset}
       --vault path --write                   ${COLORS.dim}default dry-run plan · --write lands + rewrites source as slim pointer${COLORS.reset}
  ontology-atlas moment [vault]               ${COLORS.green}first-brief timing readout${COLORS.reset}: init/absorb → first agent-brief elapsed
       --mark --json                          ${COLORS.dim}manual stamp fallback · machine output${COLORS.reset}

${COLORS.bold}Bootstrap${COLORS.reset} ${COLORS.dim}(R16/R17: autonomous ingest base)${COLORS.reset}
  ontology-atlas index [rootPath]             ${COLORS.green}project ontology index${COLORS.reset}: analyze + imports + validate plan
       --apply --full --threshold N --json    ${COLORS.dim}analyzer land · import review/full delivery · machine output${COLORS.reset}
  ontology-atlas bootstrap [rootPath]         ${COLORS.green}full bootstrap in one line${COLORS.reset}: analyzer write + import review
       --threshold N --skip-imports --json    ${COLORS.dim}review filter · imports skip · machine output${COLORS.reset}
  ontology-atlas analyze [rootPath]           Walk a repo, propose ontology node candidates (side effect 0)
       --apply --max-depth N --json           ${COLORS.dim}or land via batch · accepted, no effect · machine output${COLORS.reset}
  ontology-atlas architecture [rootPath]      Compare reviewed architecture intent with current source imports
       --profile slug --max-files N --json    ${COLORS.dim}roles · rules · violations · agent plan contract${COLORS.reset}
  ontology-atlas infer-imports [rootPath] TS/JS/Python/Rust file + Go package evidence (side effect 0)
       --apply --full --threshold N --max-files N ${COLORS.dim}apply disabled · review/full delivery · default 5000 max${COLORS.reset}
  ontology-atlas preflight [vault]            ${COLORS.green}Commit preflight${COLORS.reset}: staged files → vault nodes → blast-radius summary
       --staged --depth N --json              ${COLORS.dim}non-blocking, silent when nothing matches${COLORS.reset}
  ontology-atlas snapshot [vault]             ${COLORS.green}Snapshot the vault${COLORS.reset}: vault-scoped git commit with a semantic summary
       --dry-run --push --message "..." --json ${COLORS.dim}local commit by default · --push sends to your existing upstream${COLORS.reset}
       --history [N] --diff --pull            ${COLORS.dim}vault commit log · uncommitted preview · graceful pull (opt-in)${COLORS.reset}
  ontology-atlas connect-source <project>     ${COLORS.green}Connect the code${COLORS.reset}: bind a project node to the folder it describes
       --root path --confirm --repair --json  ${COLORS.dim}dry-run by default · folder inferred from the vault's git repo${COLORS.reset}
  ontology-atlas disconnect-source <project>  Undo that binding (dry-run by default)
       --confirm --json                       ${COLORS.dim}removes only this project's binding · no markdown changes${COLORS.reset}

${COLORS.bold}Graph-level commands${COLORS.reset} ${COLORS.dim}(R15: wraps the MCP server, same authority as an AI agent)${COLORS.reset}
  ${COLORS.dim}Set OATLAS_CLI_MCP_TIMEOUT_MS=N when a large / slow vault needs a longer one-shot MCP call window.${COLORS.reset}
  ontology-atlas backlinks <slug>             Every file linking the slug (--json)
  ontology-atlas constellations [vault]       Saved constellation metadata (read-only)
       --offset N --limit N --json            ${COLORS.dim}bounded discovery · purpose unknown stays unknown${COLORS.reset}
  ontology-atlas constellation <id> [vault]   Saved scope + current facts, review, real relations, dependencies
       --offset N --limit N --relation-limit N --dependency-limit N --json
  ontology-atlas orphans [vault]              Isolated nodes (nothing else references them)
       --kind X --exclude-kinds A,B --json    ${COLORS.dim}filter / skip / machine output${COLORS.reset}
  ontology-atlas path <from> <to>             Shortest path (BFS) with relation type per hop
       --max-hops N --json                    ${COLORS.dim}default 5${COLORS.reset}
  ontology-atlas explain <from> <to>          Direct edges + shortest path + common-neighbor evidence
       --direction undirected --types A,B --json
  ontology-atlas all-paths <from> <to>        Bounded simple paths + completeness evidence
       --max-hops N --limit N --search-budget N --types A,B --json
  ontology-atlas reachability <slug>          Transitive reachable nodes by layer from one start node
       --depth N --direction outgoing --types A,B --plan --json
  ontology-atlas relation-check <from> <to> <type>
                                              ${COLORS.dim}schema-aware add_relation preflight${COLORS.reset}
  ontology-atlas relate <from> <to> <type>
                                              ${COLORS.green}Write a relation${COLORS.reset}: same preflight as relation-check, then lands it
       --dry-run --json                       ${COLORS.dim}preview only · machine output${COLORS.reset}
  ontology-atlas remove-relation <from> <to> <type>
                                              ${COLORS.dim}The mirror of relate: takes one relation back off${COLORS.reset}
       --dry-run --json                       ${COLORS.dim}preview only · machine output${COLORS.reset}
  ontology-atlas query "<filter>"             Typed filter DSL (kind=X AND has(elements))
       --limit N --json                       ${COLORS.dim}default limit 100${COLORS.reset}
  ontology-atlas match-nodes [vault]          Graph DB-style node scan with kind/domain/degree filters
       --kind K --min-degree N --plan --json  ${COLORS.dim}filter-preserving query_plan support${COLORS.reset}
  ontology-atlas match-edges [vault]          Graph DB-style edge scan with type/kind/external filters
       --type T --from-kind K --plan --json   ${COLORS.dim}edge pattern rows + totalMatches${COLORS.reset}
  ontology-atlas domain-matrix [vault]        Domain coupling matrix: cross-domain edges + examples
       --project SLUG --limit N --json        ${COLORS.dim}scope to one project containment tree${COLORS.reset}
  ontology-atlas facets [vault]               Graph dashboard facets: buckets + top nodes/patterns
       --limit N --json
  ontology-atlas schema [vault]               Relation schema patterns for traversal/write preflight
       --limit N --json
  ontology-atlas pattern-walk <slug>          Explicit relation-sequence traversal evidence
       --pattern domains,capabilities --limit N --json
  ontology-atlas project-map <project>        Domain-by-domain project containment map
       --limit N --item-limit N --json
  ontology-atlas compile [vault]              Deterministic graph compile + optional reorder
       --summary --fix --json                 ${COLORS.dim}hash/counts · canonicalize relation arrays${COLORS.reset}
  ontology-atlas export [vault]               ${COLORS.green}Interop export${COLORS.reset}: compile → standard exchange format (stdout)
       --format jsonld|graphml|json           ${COLORS.dim}RDF JSON-LD · Gephi GraphML · raw artifact${COLORS.reset}
  ontology-atlas overview [vault]             Vault first-contact dashboard (counts + distribution + hubs)
       --limit N --json                       ${COLORS.dim}N hubs (default 10) · machine output${COLORS.reset}
  ontology-atlas hubs [vault]                 Centrality 4 rankings: PageRank / Bridges / Authorities / Hubs
       --limit N --json                       ${COLORS.dim}N rows per ranking (default 10)${COLORS.reset}
  ontology-atlas blast-radius <slug>          Declared dependency impact + evidence qualification (structure excluded)
       --depth N --direction incoming|outgoing|both --json
  ontology-atlas cycles [vault]               Detect depends_on dependency cycles
       --max-hops N --json                    ${COLORS.dim}default maxDepth 8${COLORS.reset}
  ontology-atlas components [vault]           Connected graph islands before trusting traversal maps
       --limit N --node-limit N --types A,B --json
  ontology-atlas topological-order [vault] Prerequisite-first dependency ordering
       --limit N --types A,B --include-isolated --json
  ontology-atlas health [vault]               Graph integrity dashboard (source paths compared)
  ontology-atlas analysis [rootPath]          Dated findings record, compared with the previous run
       --json --component-types A,B           ${COLORS.dim}focused diagnosis tuning${COLORS.reset}
  ontology-atlas agent-brief [vault]          Claude Code/Codex handoff: readiness + first MCP calls
       --prompt --graph-db-pack --verify-fallbacks
                                              ${COLORS.dim}pasteable handoff · shell Graph DB pack · fallback self-check${COLORS.reset}
  ontology-atlas workspace-brief [vault]      Status + hotspots + project_scope nodes + next actions on one screen
       --json --dependency-types A,B          ${COLORS.dim}health/workspace_brief tuning forwarding${COLORS.reset}
  ontology-atlas growth [vault]               Growth candidates from MCP growth_plan
       --limit N --json                       ${COLORS.dim}relations · external refs · dangling refs · ignored refs${COLORS.reset}
  ontology-atlas maintenance [vault]          Ordered graph cleanup/repair work queue
       --limit N --after-action-id ID --json  ${COLORS.dim}cursor page · filterable maintenance_plan${COLORS.reset}
  ontology-atlas node <slug> [vault]          One node deep dive: header · lineage · incoming/outgoing edges
       --limit N --types A,B --no-external --no-unresolved --json
                                              ${COLORS.dim}hotspot edge group + relation/ref filter${COLORS.reset}
  ontology-atlas similar "<title>" [vault]    Find similar nodes in a vault (check before adding, so you do not add a duplicate)
       --slug X --kind K --limit N --json     ${COLORS.dim}by slug / kind filter / N results / machine${COLORS.reset}
  ontology-atlas rename <old> <new>           Atomic rename: moves .md, redirects every backlink
       --confirm --overwrite                  ${COLORS.dim}default dry-run; --overwrite replaces existing target${COLORS.reset}
  ontology-atlas merge <from> <into>          Atomic merge: redirect backlinks then delete fromSlug
       --confirm                              ${COLORS.dim}default dry-run; --confirm to apply${COLORS.reset}
  ontology-atlas delete <slug>                Permanent delete (refuses if backlinks remain)
       --confirm --force                      ${COLORS.dim}--confirm to apply; --force to ignore backlinks${COLORS.reset}

  ontology-atlas --help                       Show this help
  ontology-atlas --version                    Print version

${COLORS.bold}What 'init' does:${COLORS.reset}
  - Creates project / domain / capability / element starter .md files
  - Each file has frontmatter (kind / slug / title / depends_on / capabilities / ...)
  - Writes wired .mcp.json files for Claude Code / Cursor in both cwd and the vault
  - Writes wired .codex/config.toml files for Codex in both cwd and the vault
  - Prints the exact Codex 'mcp add' command as a global-config fallback
  - Recommends 'bootstrap' to replace untouched starters with a first real graph
  - For an existing vault, run 'agent-setup --write' to repair only agent configs

${COLORS.bold}Mission:${COLORS.reset}
  vault frontmatter = the graph. Humans + AI agents author the same vault.
  Workbench: https://github.com/wlsdks/ontology-atlas

${COLORS.dim}https://github.com/wlsdks/ontology-atlas${COLORS.reset}
`);
}
