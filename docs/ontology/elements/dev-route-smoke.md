---
slug: elements/dev-route-smoke
kind: element
title: Dev Route Smoke
domain: views
elements: [scripts/check-dev-locale-routes.mjs, scripts/clean-next-dev-cache.mjs]
---

`scripts/check-dev-locale-routes.mjs` powers `pnpm dev:route-smoke`. It starts a temporary Next dev server, or checks an existing `--base-url`, then verifies the locale-prefixed workbench routes used for browser design checks return 2xx responses.

`scripts/clean-next-dev-cache.mjs` clears only `.next/dev` before `pnpm dev`, preventing stale dev route manifests from making `/`, `/en/`, `/ko/`, Source Vault, and ontology deeplinks render as 404 while static export remains healthy.

This keeps Context Atlas design verification grounded in a live dev route contract before browser or macOS app checks.