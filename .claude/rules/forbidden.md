# Forbidden patterns

> Auto-loaded. Violations are rejected before merge.

## Design

> Subset of `docs/DESIGN-SYSTEM.md` "Absolute rules (Don'ts)", which is
> canonical; absence here is not permission. Each `dont:` marker pairs a row
> with that source (`tests/contract/design-donts-parity.contract.test.ts`).

- **Node click → full-screen or full-bleed detail modal.** The default is ego
  focus plus a compact popover beside the node; full detail is an explicit action
  inside that popover. <!--dont:node-click-fullscreen-modal-->
- Gradients, glass, glow, neon, scale hover, overshoot or bounce motion, and
  hues beside indigo are allowed (`docs/DECISIONS.md`, "The expression bans are
  lifted"). Every value still goes through a token and its ramp, contrast floors
  and the reduced-motion equivalent hold, and a new hue names the decision it
  carries. The mascot's raster palette is not a CSS token (`docs/BRAND.md`).
- Decorative trailing arrows such as `Open →` or a trailing
  `ArrowRight`/`ArrowUpRight`. Arrows conveying path, order, causality, or an
  external-link prefix (`↗`) remain meaningful.
  <!--dont:decorative-trailing-arrow-->
- Repeated cards whose heights vary only because their copy lengths differ.
  Cards in one row have equal height. <!--dont:content-decided-card-height-->

## Routing

- Do not restore retired routes: `/admin/*`, `/login`, `/signup`, `/account`,
  `/reset-password`, `/settings/*`, `/knowledge/*`, `/review/*`,
  `/diagnostics/*` (R10), and `/skills` (decision 91). Fit new work into a
  current destination first.
- No `pages/` router, server-only API routes, server actions, or other runtime
  behaviour incompatible with static export.

## Authentication and backend

- Never restore authentication surfaces, or Firebase, Firestore, Cloud
  Functions, or Storage, in Layer 1. Backend SDKs are forbidden.
- Optional Layer 2 (Atlas Network: specification, hub registry, team sync after
  demand) may exist only while keeping all six trust promises; drop a feature
  that breaks one:
  1. Layer 1 stays free, complete, and offline forever.
  2. Nothing is collected silently; every transfer is opt-in and logged locally.
  3. Login is never forced.
  4. Data remains ordinary, portable Markdown.
  5. Existing promises are not reversed later.
  6. "Safe" means the implementation is public and open to audit.

## Naming

- No company codenames, personal names, or another product's brand in
  identifiers, labels, comments, or branch names; use plain domain names
  (not `reactorService` or `paravelClient`).

## Data and security

- Never commit service accounts, API keys, or `.env*` files.
- Never scan or upload arbitrary files from the user's disk, or send user data
  outside the vault silently.

## Documentation

- No temporary work-order markers such as `audit A2`, `iter 18`, or
  `Track D-cont-1` in code comments.
- `AGENTS.md` and `CLAUDE.md` must not contradict each other.
- Contributor-facing operational prose is English. Typed locale data and the
  `vault-ko` template are the exceptions.

## Plugins and extension

- Atlas never executes third-party plugin code.
- MCP tools and agent skills are the extension mechanism; they run in an agent
  program the user already chose to trust. Installing an agent CLI for the
  user follows `.claude/rules/surfaces.md`.
- Allowed extensions are declarative files only (vault Markdown, saved
  searches, templates, `.ontology-atlasignore`): no code, every change visible
  in a Git diff.

## Dependencies

- Explain every new dependency in the pull request.
- Never patch `node_modules` directly; use `pnpm patch`.

## npm publishing requires explicit user approval

Never run `npm publish`, `pnpm publish`, `yarn publish`, or another external
registry publication command until the user explicitly asks to publish.

- "Clean this up," "what next?", and "finish it" are not approval.
- You may propose publishing, then wait for the user's answer.
- Read-only audits such as `npm pack --dry-run` are allowed. Actual publication,
  tarball upload, or an `npm version` chain that publishes is not.
- The PreToolUse hook blocks the first attempt; the rule still applies when
  hooks are inactive.

## Ask why

If a change appears to require breaking a rule, change the rule first and say
why in the pull request. Do not create a silent exception in code.
