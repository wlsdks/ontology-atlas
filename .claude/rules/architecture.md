---
paths:
  - "src/**"
  - "app/**"
  - "next.config.ts"
  - "eslint.config.mjs"
---

# Architecture rules

> Conditionally loaded for application source and configuration.

## Feature-Sliced Design layers

```text
app/                       Next.js routing: thin metadata and entry wrappers
src/
  app/                     providers and initialization
  views/                   route-level page modules
  widgets/                 composite UI blocks
  features/                one user interaction each
  entities/                business entities
  shared/                  primitives, libraries, config, and types
```

Imports flow `app → views → widgets → features → entities → shared`.

- Never import upward, such as an entity importing a widget.
- Avoid cross-imports within one layer. Move truly shared behaviour down one
  layer instead. The remaining edges are a ledger that only falls:
  `tests/contract/same-layer-cross-import-ratchet.contract.test.ts`.
- `eslint-plugin-boundaries` enforces this direction.

## Next.js static export

- `next.config.ts` keeps `output: 'export'` as the default. Do not add server
  runtime dependencies, dynamic API routes, server actions, or RSC fetch streams.
- Build-time fetching may read only the committed dogfood vault manifest under
  `docs/ontology/`. Do not introduce an external build fetch.
- Use App Router only; do not add `pages/`.

## URL contract

- Add routes only under `app/[locale]/`; route views belong under `src/views/`.
- `/` depends on who is asking. A vault-less web visitor sees the gateway; an
  installed-app user or web user with a vault sees the map/first-run flow.
  `isGatewaySurface()` is the sole decision function for both shell chrome and
  route content. Making `/` unconditionally show the gateway tells an installed
  app user to download the app they are already running.
- Every link that promises the map points to `/topology`. Contract:
  `tests/contract/map-destination-route.contract.test.ts`.
- Current routes are documented once in `docs/ARCHITECTURE.md`; do not maintain a
  second list here.
- `/ontology` redirects to `/topology`; `/ontology/studio` and `/ontology/edit`
  preserve legacy links. Retired auth, admin, review, diagnostics, knowledge,
  settings, and skills namespaces must not return.
- `next-intl` prefixes every live route with `en` or `ko`.

## One source of truth

- Vault frontmatter is the ontology. Do not add a second store or database.
- Never let two input paths both claim canonical ownership of one concept.
- The build-time dogfood manifest is a fallback before a vault is selected. A
  selected user vault always wins.

## Do not compute data for a surface that is not rendered

The condition that draws a surface must also guard the work that builds its
model. `{open && <Card model={model} />}` is still expensive if `model` is
computed unconditionally.

Measured 2026-07-28: one map-node click rebuilt connections eleven times; nine
runs served a closed full-detail surface. Guarding
`use-full-detail-a1-model.ts` reduced the count to two. Preloading a lazy code
chunk is cheap; eagerly calculating its model on the interaction frame is not.

Gate this invariant by call count, not milliseconds. Time thresholds vary by
machine; “zero traversals while closed” does not. See
`src/views/home/model/use-full-detail-a1-model.test.ts`.

## i18n navigation

- Use `Link`, `useRouter`, and `usePathname` from `@/i18n/navigation` for in-app
  navigation so the locale prefix survives.
- `useSearchParams` remains from `next/navigation`; it is locale-independent.
- Use the raw Next router only for an intentional cross-locale redirect.

## Regression barriers

- R10b removed Firebase and every backend SDK. A static local-first export must
  not reintroduce a cloud SDK; `forbidden.md` owns that rule.
- Some ESLint rules still reserve a split between an entity barrel and an `api/`
  path. No `api/` folder exists today; the rules remain only for a possible later
  collaboration phase.
