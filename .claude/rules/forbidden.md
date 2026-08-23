# Forbidden patterns

> Auto-loaded. Violations are rejected before merge.

## Design

> `docs/DESIGN-SYSTEM.md` “Absolute rules (Don'ts)” is canonical. This is an
> intentional always-loaded subset containing decisions required before a file
> is opened. Each `dont:` marker pairs a row with that source; unknown keys fail
> `tests/contract/design-donts-parity.contract.test.ts`.
>
> Absence here is not permission. The canonical list also covers colliding
> popovers, non-blocking modals, floating-box soup, one-off topology values,
> accepted overlap, and glow rings. Opening UI loads `design.md`, which points to
> the complete source.

- **Node click → full-screen or full-bleed detail modal.** The default is ego
  focus plus a compact popover beside the node; full detail is an explicit action
  inside that popover. This stays always loaded because it is an interaction
  decision, not a lintable value, and a brand-new surface may be planned before
  `design.md` loads. <!--dont:node-click-fullscreen-modal-->
- Purple-to-pink gradients. <!--dont:purple-pink-gradient-->
- Glassmorphism (`backdrop-blur-*`). <!--dont:glassmorphism-->
- Glow pulse, neon, or halo animation. <!--dont:glow-pulse-neon-->
  - A colour border spreading outward through `boxShadow: 0 0 …` is the same
    forbidden glow ring. <!--dont:glow-boxshadow-ring-->
  - One written exception (2026-07-29): footprint-trail bloom, only when static,
    opt-in, default zero, and capped at 6 px in `footprint-glyph.ts`. Canonical
    rationale: Design System Don'ts. Gates: the `shadowBlur` selector in
    `eslint.config.mjs` and `footprint-bloom-exception.contract.test.ts`.
- Animated gradient backgrounds and auroras. <!--dont:animated-gradient-bg-->
  - One written exception (2026-08-18): the gateway current field, constrained
    by `gateway-fx-exception.contract.test.ts` and the canonical Don'ts.
  - This ban governs what the app renders. OS icons, favicons, Open Graph images,
    and other brand assets may use one indigo brightness ramp from `#787EF6` to
    `#3E4BDF`; they may not introduce or mix another hue. In-app `BrandMark` stays
    monochrome through `currentColor`. `src/shared/ui/brand-mark.tsx` alone owns
    brand geometry and colour.
- Scale-based hover (`hover:scale-*`). <!--dont:scale-hover-->
- More than one colour system; do not add another brand colour beside indigo.
  <!--dont:multi-color-system-->
- Decorative trailing arrows such as `Open →` or a trailing
  `ArrowRight`/`ArrowUpRight`. Arrows conveying path, order, causality, or an
  external-link prefix (`↗`) remain meaningful. Gate:
  `tests/contract/label-decoration.contract.test.ts`.
  <!--dont:decorative-trailing-arrow-->
- Repeated cards whose heights vary only because their copy lengths differ.
  Cards in one row have equal height. <!--dont:content-decided-card-height-->

The retired “ontology studio game exception” no longer exists. `/ontology/studio`
once allowed `--studio-*` glow, gradients, aura, particles, rarity colours, and
shimmer. The 2026-07-24 owner decision reversed it: “make it addictive like a
game” was a metaphor, not a visual specification, and game styling weakened
trust in decision material. Studio itself retired on 2026-08-21. Contextual map
editing and ACP proposal cards follow the same neutral-plus-indigo system as the
rest of the app. Glow, rarity, particles, and gems remain forbidden; old studio
tokens and motion classes were removed from `app/globals.css`. Retention comes
from a visible next action, immediate feedback, and accumulated progress.

Details: `@.claude/rules/design.md` and `@docs/DESIGN-SYSTEM.md`.

## Routing

- Do not restore retired routes. R10 removed `/admin/*`, `/login`, `/signup`,
  `/account`, `/reset-password`, `/settings/*`, `/knowledge/*`, `/review/*`, and
  `/diagnostics/*`; decision (91) removed `/skills` on 2026-08-21. Fit new work
  into a current destination first.
- Do not add the `pages/` router; use App Router.
- Do not add server-only API routes, server actions, or other runtime behaviour
  incompatible with static export.

## Authentication and backend

- Never restore authentication surfaces in Layer 1.
- Never reintroduce Firebase, Firestore, Cloud Functions, or Storage in Layer 1.
- v9 introduced optional Layer 2, Atlas Network: a specification, hub registry,
  and team sync only after demand. It may exist only while satisfying all six
  trust promises:
  1. Layer 1 stays free, complete, and offline forever.
  2. Nothing is collected silently; every transfer is opt-in and logged locally.
  3. Login is never forced.
  4. Data remains ordinary, portable Markdown.
  5. Existing promises are not reversed later.
  6. “Safe” means the implementation is public and open to audit.
  Drop a feature that requires breaking this charter.
- Backend SDKs outside that charter remain forbidden.

## Code and architecture

- Do not violate FSD import direction, such as an entity importing a widget.
- Do not make two stores canonical for one concept. When values disagree, vault
  Markdown wins.
- Do not bypass Git hooks with `--no-verify` or force-push `main`.

## Naming

- Do not place company codenames, personal names, or another product's brand in
  identifiers, labels, or comments.
- Use plain domain names rather than internal codenames such as
  `reactorService` or `paravelClient`.
- Commit messages use conventional English prefixes.

## Data and security

- Never commit service accounts, API keys, or `.env*` files.
- Never scan or upload arbitrary files from the user's disk.
- Never send user data outside the vault silently.

## Documentation

- Do not leave temporary work-order markers such as `audit A2`, `iter 18`, or
  `Track D-cont-1` in code comments.
- Do not leave broken README or CLAUDE links, or let `AGENTS.md` and `CLAUDE.md`
  contradict each other.
- Do not write contributor-facing operational prose in Korean. Typed locale data
  and the `vault-ko` template are the explicit exceptions.

## Plugins and extension (owner direction, 2026-07-23)

- Atlas will never execute third-party plugin code. That conflicts with the trust
  charter and gives no reason to run unaudited code inside a static local-first
  product.
- MCP tools and agent skills are the extension mechanism. They run in Claude
  Code, Codex, Cursor, or another program the user already chose to trust.
- Allowed extensions are declarative files only: vault Markdown or configuration
  such as saved searches, templates, and `.ontology-atlasignore`. They execute no
  code and expose every change through Git diff.

### Installing an agent tool for the user (2026-08-20)

The rules above prohibit a plugin marketplace inside Atlas. The app may install
an agent CLI only when all four conditions hold: the user initiates it, sees the
exact command first, installation stays in an app-owned location, and the version
is pinned. Missing any condition forbids the action. Downloading a Node runtime
was separately approved in decision (89); later runtime families need a new
record. Evidence and losing dissent: ledger 2026-08-20 (88) and (89).

## Dependencies

- Explain every new dependency in the pull request.
- Do not add backend SDKs incompatible with the R10 local-first promise.
- Never patch `node_modules` directly; use `pnpm patch`.

## npm publishing requires explicit user approval

Never run `npm publish`, `pnpm publish`, `yarn publish`, or another external
registry publication command until the user explicitly asks to publish.

- “Clean this up,” “what next?”, and “finish it” are not approval.
- The PreToolUse hook in `.claude/settings.json` blocks the first attempt; this
  behavioural rule still applies when hooks are inactive.
- You may propose publishing, then wait for the user's answer.
- Read-only audits such as `npm pack --dry-run` are allowed. Actual publication,
  tarball upload, or an `npm version` chain that publishes is not.

Published versions are effectively permanent after the unpublish window and use
the owner's identity. Requiring a deliberate diff and audit protects that
reputation.

## Ask why

If a change appears to require breaking a rule, explain why in the pull request
and change the rule itself first. Do not create a silent exception in code.
