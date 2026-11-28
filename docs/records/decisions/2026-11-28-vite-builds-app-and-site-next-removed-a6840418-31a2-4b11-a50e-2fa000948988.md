---
id: a6840418-31a2-4b11-a50e-2fa000948988
date: 2026-11-28
---
## 2026-11-28 — Vite and TanStack Router build the app and the website, and Next.js is removed

**Why**: Atlas used none of Next's server, yet its build took 31 s at 3.3 GB and `pnpm dev` 13 s to reach the map (`docs/specs/2026-11-27-ui-on-vite.md`); the owner chose one lighter toolchain.
**Prior**: replaces the Next App Router, `next-intl` and `output: 'export'`. Addresses, page heads and the sitemap are unchanged, and the installed app still embeds one folder while the website serves another.
**Decision**: screens are file routes under `src/app/routes/$locale/` (`_app`, `_site`). A route declares the query it reads as `validateSearch` and hands the typed value to its view as `search`, copied onto an object with no prototype so a key such as `constructor` is only a key under the installed app's frozen `Object.prototype`. A retired address answers from `beforeLoad` and keeps the hash. `pnpm build` writes the app folder and the prerendered site folder. `next`, `next-intl`, `@next/*`, `eslint-config-next` and `@tailwindcss/postcss` are deleted; `sharp` becomes a direct dev dependency. The page diff script and first-deploy guard stay until the first Vite deploy passes.
**Dissent**: Next's prerender was a tested path nobody here maintained; the Atlas prerender script is ours to keep, and the text-only query rule is enforced in `atlas-search.ts` rather than by the framework.
**Falsifier**: the first deploy changes a page head, the sitemap or an address, a first load passes its budget (1,001 KB brotli for the map, 462 for the download page), or the installed app shows the root error screen on an odd query key.
**Owner**: stark (through the lead's brief for slices 4c and 4d of `docs/specs/2026-11-27-ui-on-vite.md`)
