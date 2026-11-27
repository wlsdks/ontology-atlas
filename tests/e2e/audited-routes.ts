/**
 * Adding a route means adding it here; the audited-route-coverage contract test
 * fails on unclassified routes. A route left out is recorded as excluded with a reason.
 */

/**
 * The URLs the ratchets actually open.
 *
 * A plain browser opens every workbench address as the page that says the app is needed
 * (`app-only-page`), so the ratchets measure that page there; the screens themselves belong to the
 * installed app. Dynamic routes such as `[segment]` are opened with a value that exists. `what-is-atlas`
 * is emitted by `src/views/gateway-doc/model/guide-pages.ts`, so it always exists.
 */
export const AUDITED_ROUTES = [
  "/ko/",
  "/ko/topology/",
  "/ko/architecture/",
  "/ko/docs/",
  "/ko/projects/",
  "/ko/project/new/",
  "/ko/project/fallback/",
  "/ko/git/",
  "/ko/changes/",
  // The web state is the desktop-only card: a browser cannot run Git.
  "/ko/work-status/",
  // Measures the no-tools state: the web cannot spawn processes.
  "/ko/agents/",
  // Measures the no-vault state: a browser cannot read agent config files or hold a token.
  "/ko/agents/?tab=mcp",
  // The web state is the desktop-only card, which is all a browser ratchet can see.
  "/ko/agents/?tab=models",
  // Measures the no-folder state, the only one a ratchet without a vault can reach.
  "/ko/library/",
  "/ko/planning/",
  // Without a native folder root the browser cannot run the local clock;
  // this audits the no-folder state.
  "/ko/automations/",
  "/ko/download/",
  "/ko/sample/",
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
  "/ontology/insights": "Compatibility redirect to /topology, /library or /architecture; every target is already measured",
};
