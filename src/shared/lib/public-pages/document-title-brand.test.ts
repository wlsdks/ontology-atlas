import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards brand consistency across the i18n title messages.
 *
 * `metadata.siteName` is the single source for the app's display name, and the
 * metadata title template is `%s · {siteName}`. The static `documentTitle*` messages
 * consumed by the client-side `useDocumentTitle` must carry the same brand suffix. A
 * title value containing the ' · ' separator but not ending in siteName is brand
 * drift — as happened when siteName was renamed to "Ontology Atlas" and three
 * messages kept the "ontology-atlas" suffix, so `og:title` and `<title>` on the same
 * page disagreed.
 */

const LOCALES = ["en", "ko"] as const;
const TITLE_SEPARATOR = " · ";

type MessageTree = { [key: string]: string | MessageTree };

function loadMessages(locale: string): MessageTree {
  const file = path.join(process.cwd(), "messages", `${locale}.json`);
  return JSON.parse(readFileSync(file, "utf8")) as MessageTree;
}

function flatten(
  tree: MessageTree,
  prefix = "",
  acc: Record<string, string> = {},
): Record<string, string> {
  for (const [key, value] of Object.entries(tree)) {
    const keyPath = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object") {
      flatten(value, keyPath, acc);
    } else if (typeof value === "string") {
      acc[keyPath] = value;
    }
  }
  return acc;
}

describe("i18n document-title brand consistency", () => {
  for (const locale of LOCALES) {
    const flat = flatten(loadMessages(locale));
    const siteName = flat["metadata.siteName"];

    const titleSuffixEntries = Object.entries(flat).filter(
      ([key, value]) =>
        /documentTitle/i.test(key) && value.includes(TITLE_SEPARATOR),
    );

    it(`[${locale}] defines metadata.siteName`, () => {
      expect(siteName).toBeTruthy();
    });

    it(`[${locale}] has separator-bearing document-title messages to guard`, () => {
      // With nothing left to guard the test would be vacuous, so require at least one.
      expect(titleSuffixEntries.length).toBeGreaterThan(0);
    });

    it.each(titleSuffixEntries)(
      `[${locale}] "%s" ends with siteName`,
      (key, value) => {
        expect(
          value.endsWith(`${TITLE_SEPARATOR}${siteName}`),
          `${key} = ${JSON.stringify(value)} should end with "${TITLE_SEPARATOR}${siteName}"`,
        ).toBe(true);
      },
    );
  }
});
