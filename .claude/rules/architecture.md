---
paths:
  - "src/**"
  - "app/**"
  - "next.config.ts"
  - "eslint.config.mjs"
  - "scripts/**"
  - "mcp/src/**"
  - "cli/src/**"
  - "src-tauri/src/**"
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

## Code explains itself

Code that reads well for a person reads well for an agent. Write what the
current need requires, so the source alone carries the meaning.

- Names carry intent: a function names what it returns or does, a boolean
  reads as a question, a unit sits in the name (`delayMs`, `widthPx`), and a
  meaningful literal is a named constant beside its use.
- One function, one job. When a comment explains what a block does, rename or
  extract so the code says it, then delete the comment.
- Add no wrapper layer, option object, parameter or defensive branch that no
  current caller needs, and no helper that duplicates one that exists.
- A comment states only a current constraint or reason the code cannot show,
  in at most three lines. Do not restate code, narrate history (dates,
  "used to", incidents, measurements), draw section banners or keep
  commented-out code. History that still matters is a `pnpm record:new`
  record cited by its `.md` path in one line (`pnpm docs:comment-refs`
  resolves it). A numeric bound may keep one line naming its measurement.
- Algorithmic code (layout, search and matching, diffing, parsing, graph
  traversal) states its complexity in a name, type or one line, chooses its
  data structure on purpose, and lands only after an independent `reviewer`.
- A file stays under 800 lines and a folder under 30 direct files. Split by
  responsibility into a cohesive subfolder within its layer; add an `index`
  only where the layer's public API already has one. A split must not grow
  total lines.
- Per area, comment bytes, files over 800 lines and folders over 30 files only
  fall against the merge base (`source-comment-bytes`, `source-shape`
  contracts); a deliberate raise is a `tests/contract/ratchet-raises/` record.
- Dependencies, adapted code and borrowed assets follow
  `docs/engineering/third-party-code.md`; its `// Adapted from` license marker
  is a required comment, never cleanup.
