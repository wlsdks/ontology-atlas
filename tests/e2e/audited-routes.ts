/**
 * Adding a route means adding it here; the audited-route-coverage contract test
 * fails on unclassified routes. A route left out is recorded as excluded with a reason.
 */

/**
 * The URLs the ratchets actually open.
 *
 * Dynamic routes such as `[slug]` and `[segment]` are opened with **a value that
 * exists** — opening a non-existent slug falls through to 404 and measures the 404
 * rather than that route.
 *
 * ⚠️ **"Exists" means in the running data source, not in the build output.** Even
 * with `out/ko/project/<slug>/` present in the static export, if the vault the app
 * is reading at that moment (`samples/storefront/` when no vault is chosen) has no
 * such project, the screen is a degraded card or empty. The comments on the two
 * project lines below record what that cost, measured. `what-is-atlas` is emitted by
 * `src/views/gateway-doc/model/guide-pages.ts`, so it always exists regardless of
 * data source.
 */
export const AUDITED_ROUTES = [
  "/ko/",
  "/ko/topology/",
  "/ko/architecture/",
  "/ko/docs/",
  "/ko/ontology/insights/",
  "/ko/projects/",
  // The slug must exist in the running data source (`samples/storefront/`), not only the build output;
  // a missing project renders a degraded card or no `<main>`, which the ratchets would not measure.
  "/ko/project/storefront/",
  "/ko/project/storefront/edit/",
  "/ko/project/new/",
  "/ko/project/fallback/",
  "/ko/git/",
  "/ko/changes/",
  // Measures the no-tools state: the web cannot spawn processes.
  "/ko/agents/",
  // Measures the no-vault state: a browser cannot read agent config files or hold a token.
  "/ko/agents/?tab=mcp",
  // The web state is the desktop-only card, which is all a browser ratchet can see.
  "/ko/agents/?tab=models",
  // Measures the no-folder state, the only one a ratchet without a vault can reach.
  "/ko/library/",
  // Without a native folder root the browser cannot run the local clock;
  // this audits the no-folder state.
  "/ko/automations/",
  "/ko/download/",
  "/ko/guide/",
  "/ko/guide/what-is-atlas/",
  "/ko/changelog/",
  // Only the root `app/not-found.tsx` renders under static export; both URLs stay in case the
  // locale file's not-found wiring returns.
  "/ko/this-route-does-not-exist/",
  "/this-route-does-not-exist/",
] as const;

/**
 * **Routes deliberately not measured, with the reason.**
 *
 * The key is the route pattern relative to `app/[locale]/` (the contract test above
 * matches on this key).
 */
export const EXCLUDED_ROUTES: Readonly<Record<string, string>> = {
  // Redirects have no screen of their own; opening one would measure the destination twice.
  "/ontology": "리다이렉트 → /topology?index=expanded — 목적지를 이미 잰다",
  "/ontology/edit": "호환 리다이렉트 → /topology contextual workbench — 목적지와 편집 상태를 이미 잰다",
  "/ontology/studio": "호환 리다이렉트 → /topology contextual workbench — 자기 화면이 없다",
  "/mcp": "호환 리다이렉트 → /agents/?tab=mcp — 목적지를 이미 잰다",
};
