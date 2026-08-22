import type { FullConfig } from "@playwright/test";

/**
 * Warms up the e2e routes.
 *
 * Playwright runs against `pnpm dev` (Turbopack), where opening a route for the
 * **first** time triggers on-demand compilation taking seconds to tens of seconds.
 * Meanwhile `expect(...).toBeVisible()`'s 10 s timeout fires first, so specs failed
 * sporadically with the product working fine (the same spec passing entirely in 9 s
 * one run and taking 1.2 minutes with partial failures the next).
 *
 * Hitting the main routes once here finishes compilation, so the real tests face a
 * warmed server and run deterministically. Failures are ignored — warm-up is an
 * optimisation, not a gate.
 */
const WARMUP_PATHS = [
  "/",
  "/en/",
  "/ko/topology/",
  "/en/topology/",
  "/ko/docs/",
  "/en/docs/",
  "/en/ontology/insights/",
  "/en/projects/",
  "/en/download/",
];

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use?.baseURL;
  if (!baseURL) return;
  for (const path of WARMUP_PATHS) {
    try {
      await fetch(new URL(path, baseURL), { redirect: "follow" });
    } catch {
      // Ignore warm-up failures — the tests themselves make the real judgement.
    }
  }
}
