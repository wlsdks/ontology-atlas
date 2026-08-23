# TECH STACK — Technology Stack Decision Record

> Decisions were recorded on 2026-07-17; package/runtime facts were refreshed
> from the repository on 2026-08-23.
> Decision principle: **Maintaining verified stacks is the default** (same logic as rejecting full rewrites — replacement is only allowed when measured benefits clearly exceed migration costs). Next full review: January 2027 or when branch conditions trigger.
> Some investigations relied on session search budget exhaustion for training data + official documentation fetches — items marked `⚠` require re-verification before execution.

## Web Front-end

| Layer | Current | Verdict | Rationale |
|---|---|---|---|
| Next.js | 16.2.12 static export | **KEEP** | Static export is mature. Switching to Astro/React Router costs more in local-first redesign than it gains |
| React | 19.2.8 | **KEEP** | React Compiler activation to be decided after performance measurement in Slice 2 (topology-map-v2) |
| TypeScript | `typescript` → `@typescript/typescript6` 6.0.2; `@typescript/native` → 7.0.2 | **CURRENT PACKAGE CONTRACT** | The manifest keeps the Next/eslint-compatible 6.0 alias alongside the native 7.0 package; re-evaluate only when those consumers support the native API directly |
| Tailwind | 4.3.3 | **KEEP** | @theme CSS token stability, design system consistency |
| ESLint | 9 flat | **KEEP (confirmed)** | Biome 2.5 does not support eslint-plugin-boundaries (FSD gate) — with architecture enforcement required, ESLint is the only choice |
| pnpm | 10.x | **KEEP** | Bun's roadmap is unpublished post-Anthropic acquisition + Next static export compatibility is immature — watch only |
| next-intl | 4.13.4 | **KEEP** | Maintain App Router i18n standard |

## Desktop

| Layer | Current | Verdict | Rationale |
|---|---|---|---|
| Tauri | v2.11.x | **KEEP (short-term)** | Stuttering cause is React orchestration, not WebView — pre-confirmed. Electron switch rejected due to 4–6 weeks + 3x bundle size |
| Low-alpha synthesis bug | Owner machine reproduction | **Isolate + upstream report** | No public reports on Wry/Tauri issue tracker — write repro case (`rgba` dim test) and report. Product defense: maintain existing invariants: dim = hidden or opaque token, low-alpha prohibited (enforced via unit tests) |
| Branch point (Q4 2026) | — | **Conditions specified** | The former Sigma gate is superseded: the current map is the custom canvas-2D `topology-map-v2` renderer with Graphology + ForceAtlas2. Re-evaluate Tauri/Electron/PWA only against this renderer's measured runtime behavior |

## CLI · MCP · Testing

| Layer | Current | Verdict | Rationale |
|---|---|---|---|
| Module format | Plain .mjs ESM | **KEEP + JSDoc enhancement** | TS conversion costs more in build pipeline than it gains. Path: JSDoc → (optional) deploy `.d.ts` via `tsc --emit-declaration-only` |
| Node engines | `>=24 <25` | **CURRENT** | Root, CLI, and MCP package manifests share the Node 24 contract |
| arg parsing | Manual (cli-args.mjs) | **KEEP** | Sufficient for the current flat 54-command registry and low-complexity flags. Adopting citty etc. rejected as benefits don't justify --help automation level |
| MCP SDK | `@modelcontextprotocol/core` / `server` 2.0.0 | **KEEP + watch** | Stdio transport; verify registry/tool-schema changes when a contract changes |
| Vitest / Playwright | 4.1.10 / 1.62.0 | **KEEP** | Stable. Major upgrades opportunistic after release note review |
| npm publish prep (N1) | **RETIRED (2026-07-27)** | npm publishing is not a delivery channel; the source checkout and installed macOS app carry the CLI/MCP |

## LLM · Layer 2 (Deferred decision — implement when relevant gate triggers)

| Use case | Decision | Timing | Rationale |
|---|---|---|---|
| In-app Q&A SDK | **Vercel AI SDK 5** (provider-agnostic BYOK) | Upon passing Slice 3 gate | Compatible with static export, free provider switching — aligns with no-credit-bundle principle |
| Local models | Ollama·LM Studio **direct localhost connection** | Slice 3 | OpenAI-compat, no CORS issues |
| Cloud CORS | **Tauri sidecar proxy** | Slice 3 | Anthropic/OpenAI API browser direct connection assumed impossible ⚠ — keys stored in OS keychain (Tauri v2 API name to be re-verified ⚠) |
| Coordinate server | **Cloudflare Workers + Durable Objects** (primary candidate) | N3 (Sync demand gate) | Minimal solo operation, auditable. Self-built binaries (Rust/Go) are subsequent migration options |
| E2E encryption | **age** (rage/Typage) | Sync step 2 | git-native·multi-recipient·post-quantum hybrid. Prerequisite: Trust Charter #6 (implementation open) |
| Payments | **None (owner decided 2026-07-17)** | — | Not for sales — pure open source, local execution (self-hosted) model. Donations only via optional GitHub Sponsors. Even if Team Sync is created, it remains self-hostable open source |

## What We Decided Against (Rejection Log)

- Switch to Biome/oxlint (lost FSD boundary gate) · Switch to Electron (cost > benefit, misdiagnosed cause) · Replatform Astro/React Router · Introduce CLI framework · Switch to TS (cli/mcp) · Adopt Bun (roadmap unpublished) · Replace D3/Cosmograph/G6 visualizations.
- **[Updated, 2026-07-18]** Since the above visualization decision point, `refactor/retire-sigma-topology`
  (#344) has been merged; `/topology`'s Sigma renderer was replaced by the custom
  canvas-2D engine (`topology-map-v2`, using Graphology + ForceAtlas2 physics).
- **[Updated, 2026-07-24]** With the removal of the `/docs` folder topology minimap,
  Sigma.js and `@sigma/*` dependencies have completely disappeared from the codebase. Current
  rendering is owned by `topology-map-v2`, graph data structures/physics by Graphology +
  ForceAtlas2. The Sigma review record below reflects the rationale at that time, not the current
  implementation contract.

## Immediate Actions (This Cycle — historical, superseded)

These were the 2026-07-17 action list. They are retained as history, not
current instructions: Node 24 and the current renderer are already the package
and runtime contract, and npm publishing is retired.

1. Update `package.json` engines `>=22` (cli·mcp·root) — 30 min.
2. Write Wry low-alpha reproduction case → report upstream issue — before Slice 2.
3. Draft N1 npm publish checklist as a GitHub Actions workflow — at N1 milestone.
4. TS 6.0 upgrade ticket — after passing Slice 1.
