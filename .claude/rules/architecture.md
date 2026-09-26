---
paths:
  - "src/**"
  - "app/**"
  - "next.config.ts"
  - "eslint.config.mjs"
---

# Architecture rules

## Layers

Root `app/` is thin Next routing; `src/` imports flow
`app → views → widgets → features → entities → shared`, and
`eslint-plugin-boundaries` blocks upward imports. Avoid same-layer
cross-imports: move shared behaviour down one layer. The remaining edges only
fall (`same-layer-cross-import-ratchet.contract.test.ts`).

## Static export

Build-time fetching reads only the committed dogfood manifest under
`docs/ontology/`; add no external build fetch. The manifest is a fallback before
a vault is chosen, and a selected vault always wins. Server-runtime bans:
`forbidden.md`; one canonical store: `local-first.md`.

## URL contract

- Routes live under `app/[locale]/`, their views under `src/views/`. The route
  list lives only in `docs/ARCHITECTURE.md`.
- `isGatewaySurface()` alone decides, for both shell chrome and content,
  whether `/` shows the gateway (vault-less web visitor) or the map/first-run
  flow (installed app, or web with a vault). Never make `/` the gateway
  unconditionally: it would tell an app user to download the app.
- Every link that promises the map points to `/topology`
  (`map-destination-route.contract.test.ts`).
- In-app navigation uses `Link`, `useRouter` and `usePathname` from
  `@/i18n/navigation`. `useSearchParams` stays on `next/navigation`; the raw
  Next router is only for an intentional cross-locale redirect.

## Do not compute data for a surface that is not rendered

The condition that renders a surface also guards building its model:
`{open && <Card model={model} />}` is still expensive when `model` is computed
unconditionally. Gate this by call count, never milliseconds
(`src/views/home/model/use-full-detail-a1-model.test.ts`).
