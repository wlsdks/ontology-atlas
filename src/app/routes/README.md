# src/app/routes

TanStack Router file routes; a screen's code is found from its address. `$locale/_app/` holds the
app screens inside the workbench providers, `$locale/_site/` the public pages. Each screen module
renders its page title and its view from `src/views/` and nothing else. `src/app/route-tree.gen.ts`
is generated from this folder by the Vite build and is committed; `src/app/app-route-tree.gen.ts` is the same
tree without `_site/download.tsx` and `_site/sample.tsx`, which the installed app's build reads instead
(`vite.config.ts`), so the app folder holds no code of the two pages. Name a route file `download.tsx` or
`sample.tsx` only for those pages.

`-site/` holds what public routes share (head, build facts, guide loader); see its README. The prerender that writes
the website's pages from these routes is `scripts/web/site/`.

`-redirects/` answers the retired addresses (`/mcp`, `/ontology`, `/ontology/edit`, `/ontology/studio`,
`/ontology/insights`) from `beforeLoad`, before any screen renders. A screen that reads a query declares
it as `validateSearch` (`screenSearch` in `@/shared/lib/navigation/search-text`) and hands the typed value
to its view as `search`.
