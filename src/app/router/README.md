# src/app/router

The router and what stands around every screen. `create-atlas-router.ts` builds it from the
committed route tree; `atlas-search.ts` is its query serializer; the layouts and the standalone
not-found and error screens are here too.

- `atlas-search.ts` keeps an address's bytes: `%20`, Hangul, repeated keys and `?flag` leave the
  router the way they came in, and every value stays a string.
- `navigate-to-address.ts` is the one place that turns a path, query and hash into a router move.
- `use-committed-address.ts` reads the address of the screen that is mounted, not the one being
  loaded, so no screen draws another screen's address.
- `BootPictureRemover.tsx` removes the loading picture of `index.html` once a screen is mounted.
