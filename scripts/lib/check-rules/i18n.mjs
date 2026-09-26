/** Message catalogues and locale routing. */

/** An authored message part, `messages/<locale>/<Namespace>.json`. */
const MESSAGE_PART = /^messages\/[^/]+\/[^/]+\.json$/;
/** A part, or the composite a pre-split branch still tracks. */
const MESSAGE_CATALOGUE = /^messages\/(?:[^/]+\/)?[^/]+\.json$/;

export const rules = [
  {
    order: 980,
    // 2026-08-08 — a council fixed copy that falsely claimed a feature was app-only,
    // and the advisor suggested only `test:i18n:messages` (catalogue consistency). The
    // gate actually pinning that copy was **`check-desktop-readiness`**, and it went
    // red only in CI — even though local verification ran everything the tool asked
    // for.
    //
    // A message catalogue is not only the input of the consistency check. It is also
    // the input of the gates that read "what does this screen claim it can do".
    command: 'pnpm test:desktop:check',
    reason: 'message copy changed — the desktop routing gate reads these strings for capability claims',
    matches: [MESSAGE_CATALOGUE],
  },
  {
    order: 990,
    command: 'pnpm test:i18n:messages',
    reason: 'locale routing or message catalog changed',
    matches: [
      MESSAGE_CATALOGUE,
      /^src\/i18n\/.*\.ts$/,
      /^scripts\/(?:validate-messages\.test|build-messages(?:\.test)?)\.mjs$/,
    ],
  },
  {
    order: 1000,
    // Since 2026-09-26 the catalogue is authored as messages/<locale>/<Namespace>.json
    // and composed into the ignored messages/<locale>.json. No module imports a part,
    // so Vitest's `--changed` graph selects nothing for a copy edit; before the split
    // the same edit selected every test importing the catalogue. This row restores
    // that selection by naming the composites the tests do import.
    command: 'pnpm exec vitest related --run messages/en.json messages/ko.json --passWithNoTests',
    reason: 'message part changed — run the tests that import the composed catalogue',
    matches: [MESSAGE_PART],
  },
];

export const directTests = {
  script: [
    ['scripts/validate-messages.test.mjs', 'scripts/validate-messages.test.mjs'],
  ],
};
