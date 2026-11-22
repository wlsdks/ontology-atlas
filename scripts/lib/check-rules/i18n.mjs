/** Message catalogues and locale routing. */

import { existsSync, readdirSync } from 'node:fs';

/** An authored message part, `messages/<locale>/<Namespace>.json`. */
const MESSAGE_PART = /^messages\/[^/]+\/[^/]+\.json$/;
/** A part, or the composite a pre-split branch still tracks. */
const MESSAGE_CATALOGUE = /^messages\/(?:[^/]+\/)?[^/]+\.json$/;

function messageLocales(directory = new URL('../../../messages', import.meta.url)) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort();
}

export function relatedMessagesCommand(locales = messageLocales()) {
  const composites = locales.map((locale) => `messages/${locale}.json`).join(' ');
  return `pnpm exec vitest related --run --passWithNoTests --exclude='tests/contract/**' ${composites}`;
}

export const rules = [
  {
    order: 980,
    // Copy is also the input of gates that read what a screen claims it can do.
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
      /^scripts\/i18n\/(?:validate-messages\.test|build-messages(?:\.test)?)\.mjs$/,
    ],
  },
  {
    order: 1000,
    // Suites import the composed messages/<locale>.json, which install builds from the
    // parts, so Vitest's graph cannot link a part to them; naming the composites can.
    command: relatedMessagesCommand(),
    reason: 'message part changed — run the tests that import the composed catalogue',
    matches: [MESSAGE_PART],
  },
  {
    order: 1010,
    command: 'pnpm test:contracts',
    reason: 'message copy changed — contracts read the catalogue from disk or import it',
    matches: [MESSAGE_CATALOGUE],
  },
];

export const directTests = {
  script: [
    ['scripts/i18n/validate-messages.test.mjs', 'scripts/i18n/validate-messages.test.mjs'],
  ],
};
