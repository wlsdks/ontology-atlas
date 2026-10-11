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
     * The shell renders above every page's `Suspense` boundary, so a hook that defers to the client
     * there breaks the prerender of untouched-looking routes. Only a real export catches it; kept to
     * the providers directory because `pnpm build` is slow.
     */
    command: 'pnpm build',
    reason:
      'the app shell changed — it renders above every page\'s Suspense boundary, and only a real static export catches a prerender bail-out',
    matches: [/^src\/app\/providers\/.+\.tsx$/],
  },
];
