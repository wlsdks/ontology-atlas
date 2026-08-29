# Technology stack

> Decisions recorded 2026-07-17. Package and runtime facts refreshed from the repository
> 2026-08-23. Next full review January 2027, or sooner if one of the branch conditions below
> actually fires.

The default is to keep a stack that has been verified working. It is the same reasoning that
rejected a full rewrite: a replacement has to show a measured benefit larger than its migration
cost, and "newer" is not a measurement.

A `⚠` marks a claim that came from a model's training data and a documentation fetch rather than
from something run here. Re-verify those before acting on them; they are the ones most likely to
have gone stale.

## What would have to happen to change each decision

The interesting column of a decision record is not the decision. Every row here says keep, so
saying it fourteen times carries nothing — what the next reader needs is the observation that
would overturn it.

### Web front end

| Layer | Version | What would overturn "keep" |
|---|---|---|
| Next.js | 16.2.12, static export | Static export stops covering a case this product needs. Astro or React Router would cost more in local-first redesign than they return |
| React | 19.2.8 | A performance measurement on the map renderer that the React Compiler would fix; that measurement is the gate for turning it on |
| TypeScript | `typescript` aliased to `@typescript/typescript6` 6.0.2, plus `@typescript/native` 7.0.2 | Next and ESLint supporting the native 7.0 API directly. Until then the manifest carries both, and the 6.0 alias exists for those two consumers |
| Tailwind | 4.3.3 | Losing `@theme` token stability, which the whole design system is built on |
| ESLint | 9, flat config | An alternative that supports `eslint-plugin-boundaries`. Biome 2.5 does not, and that plugin is the gate enforcing FSD import direction — so today there is no alternative, not merely a preferred one |
| pnpm | 10.x | Bun publishing a roadmap after the Anthropic acquisition, and its Next static-export support maturing. Watching only |
| next-intl | 4.13.4 | Leaving the App Router i18n standard |

### Desktop

| Layer | Version | What would overturn "keep" |
|---|---|---|
| Tauri | 2.11.x | Evidence that the WebView causes the stutter. It does not: the cause was traced to React orchestration. Electron was rejected at four to six weeks of work and three times the bundle |
| Renderer branch point | reopens Q4 2026 | The old branch point was written against Sigma and no longer applies. `topology-map-v2` — a custom canvas-2D engine over Graphology and ForceAtlas2 — is what any Tauri, Electron or PWA comparison now has to be measured against |

One desktop item is not a keep. **The low-alpha compositing bug** reproduces on the owner's
machine and has no public report on the Wry or Tauri trackers, so the work is to isolate an `rgba`
dim case and file it upstream. Until then the product defends itself rather than waiting: dim
means hidden or an opaque token, low alpha is prohibited, and unit tests enforce it.

### CLI, MCP, and testing

| Layer | Version | What would overturn "keep" |
|---|---|---|
| Module format | plain `.mjs` ESM, documented with JSDoc | A TypeScript conversion paying for the build pipeline it adds. If types are ever needed downstream, the cheaper path is `tsc --emit-declaration-only` |
| Node | `>=24 <25` | Nothing pending. Root, CLI and MCP manifests share this one contract |
| Argument parsing | hand-written, `cli-args.mjs` | The flat registry of 54 commands growing flags complex enough to need a framework. `citty` and its peers were rejected because `--help` automation alone did not pay for them |
| MCP SDK | `@modelcontextprotocol/core` and `server` 2.0.0 | Stdio transport is settled. Re-check the registry and tool schemas whenever a published contract changes |
| Vitest, Playwright | 4.1.10, 1.62.0 | Nothing pending. Take major upgrades opportunistically, after reading the release notes |

**npm publish preparation was retired on 2026-07-27.** npm is not a delivery channel for this
product: the source checkout and the installed macOS app carry the CLI and the MCP server, and
nothing else needs to.

## Layer 2 and LLM connections, decided but not built

None of this is implemented. Each row is a decision waiting on the gate beside it, recorded so the
choice is not made hastily on the day the gate opens.

| Use case | Decision | Waits on |
|---|---|---|
| In-app question answering | Vercel AI SDK 5, provider-agnostic, bring your own key | The Q&A slice's gate. It works under static export and lets a person switch providers freely, which is what the no-bundled-credits promise requires |
| Local models | Ollama and LM Studio over plain localhost | The same gate. Both speak the OpenAI-compatible shape and neither raises a CORS problem |
| Cloud provider CORS | A Tauri sidecar proxy | The same gate. Calling Anthropic or OpenAI directly from a browser is assumed impossible `⚠`, and keys belong in the OS keychain (the Tauri v2 API name still needs checking `⚠`) |
| Coordination server | Cloudflare Workers with Durable Objects, as the leading candidate | Real demand for team sync. Chosen for minimal solo operation and auditability; a self-built Rust or Go binary is the later migration if it ever earns one |
| End-to-end encryption | `age`, through rage or Typage | The second step of sync. Git-native, multi-recipient, and post-quantum hybrid. Trust promise six — a public, auditable implementation — is a precondition, not a nice-to-have |
| Payments | None. Owner decision, 2026-07-17 | Nothing. This is not for sale: open source, running on the person's own machine. Donations only, through GitHub Sponsors, optionally. Team sync, if it is ever built, stays self-hostable open source |

## Rejected, and why

- **Biome or oxlint** instead of ESLint — would lose the FSD boundary gate.
- **Electron** instead of Tauri — the cost exceeded the benefit, and the diagnosis it rested on
  was wrong.
- **Astro or React Router** instead of Next.js — a replatform with no measured return.
- **A CLI framework** instead of hand-written argument parsing.
- **TypeScript** for `cli/` and `mcp/`.
- **Bun** instead of pnpm — roadmap unpublished.
- **D3, Cosmograph, or G6** for the graph.

That last one has since been settled by events rather than by argument. `refactor/retire-sigma-topology`
(#344) replaced the Sigma renderer on `/topology` with the custom canvas-2D engine on 2026-07-18,
and removing the `/docs` folder minimap on 2026-07-24 took Sigma.js and every `@sigma/*` package
out of the codebase entirely. Rendering belongs to `topology-map-v2`; graph structure and physics
belong to Graphology and ForceAtlas2. Any Sigma reasoning preserved above is a record of what was
true then, not a description of the code today.

## The 2026-07-17 action list, kept as history

These four items are here because a decision record should show what it expected to happen next,
not because any of them is an instruction. Two are already contradicted by the tables above.

1. Move the `engines` field to `>=22` across root, CLI and MCP. **Superseded** — the contract is
   `>=24 <25`.
2. Write a Wry low-alpha reproduction case and report it upstream. Still open, and still the one
   real desktop task.
3. Draft an npm publish checklist as a GitHub Actions workflow. **Superseded** — npm publishing
   was retired.
4. Open a TypeScript 6.0 upgrade ticket. Done; the manifest carries the 6.0 alias today.
