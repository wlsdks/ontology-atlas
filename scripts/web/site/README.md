# scripts/web/site

Writes the website as files: one HTML page for every address the router holds, the root, the 404 page,
and the four text files crawlers read. It runs after `vite build --mode site` (`pnpm site:build`; `pnpm build:vite` runs it beside the app's build) and
renders with React's own prerender, so a page's `<title>`, `<meta>` and `<link>` tags come from the
route that owns them and the browser adopts the same markup. Start at `prerender-site.mjs`; the rest is
named for what it exports.

| File | Owns |
|---|---|
| `prerender-site.mjs` | The command: starts Vite's server-side loader, writes the files, copies the icons |
| `write-site.tsx` | Every file as text, with no disk access, so a test can read any page |
| `list-site-pages.ts` | The addresses, read from the router's own route tree |
| `record-build-facts.ts` | Answers what only this machine knows (Git dates, sample size, changelog) and keeps each answer for the page |
| `root-redirect-script.ts` | The script at `/` that sends a visitor to a language |
| `sitemap.ts`, `robots.ts`, `llms.ts` | The crawler files; Next's routes in `app/` call the same functions |
| `diff-site-pages.mjs` | `pnpm site:diff`: compares a Vite site folder with Next's export page by page |

The document around every page is `src/app/document/SiteDocument.tsx`: the browser renders it again
around the router, from the record the page carries, so ids made by `useId` agree.
