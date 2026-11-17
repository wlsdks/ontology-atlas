---
id: b00a0928-62ec-458d-b287-ba22e676ad6e
date: 2026-11-17
---
## 2026-11-17 — The gateway pages get their own locale layout and message subset

**Why**: the one locale layout handed the client provider the whole message catalog, and the provider serialises its messages into every exported page, so `/ko/download/` was 619 KB of HTML, 480 KB of it inline script carrying the workbench's copy. The owner wants the public pages light for search and answer engines.
**Prior**: none for route groups or message delivery (`pnpm decisions:find route group`, `messages`). URLs are unchanged, so no route is added or removed; the trigger is a route file move.
**Decision**: `/download`, `/guide` and `/changelog` live in `app/(gateway)/[locale]/`, a sibling of `app/[locale]/`, with `GatewayShell` (the workbench's viewport frame without the rail, overlay, updater or agent dock) and only the message paths in `src/i18n/gateway-messages.ts`, which a test derives from those pages' client import graph. Every workbench route stays in `app/[locale]/` with the whole catalog; `/` stays a workbench route.
**Dissent**: a press between a gateway page and the workbench now remounts the providers, so a web visitor with a folder open restores it again on return, and an idle prefetch across the two layouts loads chunks split differently from the workbench's. Splitting `app/[locale]` into two groups would have read more uniformly but moved every workbench route file.
**Falsifier**: a gateway page shows a missing message or a raw key, a press across the layouts reloads the document or loses an open folder for good, or the workbench's copy returns to a gateway page's HTML.
**Owner**: stark
