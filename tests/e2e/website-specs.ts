/**
 * The specs that read what the website host serves: prerendered pages, the app-only page at an app address,
 * the gateway. Playwright serves them the site folder (`out/`). Every other spec reads the app folder, the one
 * document the installed app embeds, and answers the app's native calls through the faked app runtime. A new
 * spec defaults to the app folder; `e2e-suite-split.contract.test.ts` keeps this list, the Playwright projects
 * and the files in step.
 */
export const WEBSITE_SPECS = [
  "gateway/app-address-in-a-browser.spec.ts",
  "gateway/demo-clip-locale.spec.ts",
  "gateway/download-scroll-budget.spec.ts",
  "gateway/download-still.spec.ts",
  "gateway/gateway-layout-crossing.spec.ts",
  "gateway/gateway-reading-reach.spec.ts",
  "gateway/guide-inbody-links.spec.ts",
  "gateway/guide-pager.spec.ts",
  "gateway/harness-film.spec.ts",
  "gateway/ontology-ui.spec.ts",
  "gateway/public-surface-health.spec.ts",
  "gateway/site-prerender.spec.ts",
  "gateway/touch-target-contract.spec.ts",
  "web-surface-smoke.spec.ts",
] as const;
