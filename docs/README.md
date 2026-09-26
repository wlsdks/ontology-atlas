# Documentation Guide

This folder is the engineering and product record for Ontology Atlas. For the
product itself, open the map; for live behavior, trust code over prose.

This page lists folders and root authorities only. It changes when one appears
or leaves, never when a single document is added; the Library tree in the app
lists every document.

## Root authorities

These stay at the root because a frozen link, an app default, an external URL,
or a test that parses them pins their path.

| Need | Source |
|---|---|
| Product direction and shipping behavior | `PRODUCT-DIRECTION.md`, `FEATURES.md` (index of `features/`), `../README.md` |
| Product and design decisions | `PRODUCT-OWNER-OPERATING-SYSTEM.md`, `PRODUCT-DESIGN-OPERATING-SYSTEM.md`, `records/decisions/` (`pnpm decisions:find`) |
| Architecture and routes | `ARCHITECTURE.md`, then `package.json`, `next.config.ts`, and `app/layout.tsx` |
| Ontology model and quality | `ONTOLOGY-ATLAS-SPEC.md`, `ONTOLOGY-QUALITY.md`, `FOUNDATIONS.md`, `GLOSSARY.md`, `MEANING-WORKFLOW-PLAN.md` |
| Agent and terminal surfaces | `../mcp/README.md`, `../cli/README.md`, `AGENT-GRAPH-WORKFLOW.md` |
| Verification and release | `DEVELOPMENT-CHECKS.md`, `DESKTOP-MACOS.md`, `TROUBLESHOOTING.md` |
| Visual rules | `DESIGN-SYSTEM.md` |
| Task status | `BACKLOG.md` (`pnpm backlog`) |

## Folders

| Folder | Holds | Ships in the app |
|---|---|---|
| `guide/` | user guide pages shown on the public site | yes |
| `features/` | the feature inventory, one file per destination or topic | yes |
| `contracts/` | on-disk formats and their boundaries | yes |
| `design/` | design rules beyond `DESIGN-SYSTEM.md` | yes |
| `engineering/` | build, deploy, stack and testability | yes |
| `specs/` | dated feature design specs | yes |
| `ontology/` | the project's dogfood ontology vault | yes |
| `records/` | decision, change, release, backlog and pilot fragments | `records/README.md` only |
| `plans/` | plans, historical and one live program | no |
| `launch/` | marketing copy and the demo shoot | no |
| `archive/`, `audits/`, `benchmark/`, `prototypes/` | dated evidence and drafts | no |
| `assets/readme/` | images the root README shows | no |

The vault's frontmatter is graph data; use the MCP/CLI rather than manually
guessing graph facts. Folders that do not ship still open from an in-app link,
which resolves to their GitHub page.

## Historical material

`DECISIONS.md`, `CHANGELOG.md`, `PO-PILOT.md` and
`BACKLOG-SNAPSHOT-2026-09-13.md` are frozen history; new decisions, changes and
pilot runs are fragments under `records/` written by `pnpm record:new` /
`pnpm po:record` ([how](records/README.md)). `archive/`, `audits/`, `plans/` and
`benchmark/` hold dated context, not current instructions. A deleted superseded
artifact can be recovered from Git when a specific historical question requires
it.

## Updating documentation

Update the authority that owns the change: public behavior in `README.md` and
`features/`; MCP/CLI contracts in their own READMEs; routes in
`ARCHITECTURE.md`; decisions and user-visible changes as `records/` fragments
(`pnpm record:new`); and new ontology meaning through the ontology-sync workflow.

A document that moves is listed in `.moved.json`; `pnpm docs:move` moves it and
rewrites every reference, and a branch started before the move runs it again
after merging main.

For documentation work, run the relevant focused checks, then every command
recommended by `pnpm checks:changed -- --run`. Generated docs-vault output comes
only from `pnpm docs-vault:build`; never edit it directly.
