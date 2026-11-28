# src/app/router

The router and what stands around every screen. `create-atlas-router.ts` builds it from the
committed route tree; `@/shared/lib/navigation/atlas-search` is its query serializer; the layouts and the standalone
not-found and error screens are here too.

- The address helpers live in `src/shared/lib/navigation/`: `atlas-search.ts` (the query serializer,
  which keeps `%20`, Hangul, repeated keys and `?flag` as they came in and every value a string),
  `navigate-to-address.ts` (the one place that turns a path, query and hash into a router move) and
  `use-committed-address.ts` (the address of the screen that is mounted, not the one being loaded).
- `BootPictureRemover.tsx` removes the loading picture of `index.html` once a screen is mounted.
