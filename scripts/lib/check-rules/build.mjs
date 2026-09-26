/** Static export builds. */

export const rules = [
  {
    order: 1050,
    command: 'pnpm build',
    reason: 'static export config changed',
    matches: [/^next\.config\.ts$/],
  },
  {
    order: 1060,
    /*
     * ⚠️ **The shell renders above every page's `Suspense` boundary, so a hook that defers to
     * the client there breaks the prerender of routes that look untouched** (2026-09-20).
     *
     * `AppShell` gained a `useSearchParams` call so the MCP tab could get its own first-visit
     * guide. Each page already wraps its own content in `Suspense`; the shell did not, because
     * until then nothing in the shell read the query. Under `output: 'export'` every route is
     * prerendered, so the bail-out took whole routes with it: `pnpm build` failed on
     * `/en/agents` **and** `/en/ontology/edit` — a redirect page the change never touched —
     * and the five Playwright shards that wait on the browser artifact all went red behind
     * that one broken build. A whole CI round bought nothing but the word "FAILURE" on five
     * jobs whose own specs were fine.
     *
     * Nothing in the changed-path list caught it. The unit, contract and e2e lanes all run
     * against a dev server, where this never fails; only a real export does. And the existing
     * build rule watches `next.config.ts`, which is the *configuration* of the export rather
     * than the code that has to survive it.
     *
     * Kept to the providers directory on purpose. `pnpm build` is the slowest thing this
     * advisor can recommend, and these files change rarely — a per-file content scan for
     * `useSearchParams` would be the precise rule, but this list matches on paths only, and
     * the shell is where "renders above every boundary" is actually true.
     */
    command: 'pnpm build',
    reason:
      'the app shell changed — it renders above every page\'s Suspense boundary, and only a real static export catches a prerender bail-out',
    matches: [/^src\/app\/providers\/.+\.tsx$/],
  },
];
