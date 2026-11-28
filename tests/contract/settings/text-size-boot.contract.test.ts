import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

import { buildBootScript } from "../../../src/i18n/boot-script";
import {
  TEXT_SIZE_ATTRIBUTE,
  TEXT_SIZE_ROOT_PERCENT,
  TEXT_SIZES,
} from "../../../src/shared/lib/preferences/text-size";

const ROOT = process.cwd();
const script = buildBootScript({ htmlLang: { en: "en" }, defaultLocale: "en", storageKey: "locale" });
const store = readFileSync(join(ROOT, "src", "shared", "lib", "preferences", "text-size.ts"), "utf8");
const css = readFileSync(join(ROOT, "app", "styles", "base-responsive.css"), "utf8");
const storageKey = /key: "([^"]+)"/.exec(store)?.[1];

/** Runs the real boot script against a window whose stored text size is `stored`. */
function bootWith(stored: string | null) {
  const attributes: Record<string, string> = {};
  const keysRead: string[] = [];
  vm.runInNewContext(script, {
    document: { documentElement: { lang: "", setAttribute: (name: string, value: string) => (attributes[name] = value) } },
    location: { pathname: "/en/topology/", replace: () => undefined },
    localStorage: {
      getItem: (key: string) => {
        keysRead.push(key);
        return key === storageKey ? stored : null;
      },
    },
    navigator: { languages: [], language: "" },
    window: { isTauri: true },
  });
  return { attributes, keysRead };
}

describe("text size is planted before the first paint", () => {
  it("reads the store's key", () => {
    expect(storageKey, "could not read the text-size storage key").toBeDefined();
    expect(bootWith(null).keysRead).toContain(storageKey);
  });

  it("plants the store's attribute for exactly the non-default steps", () => {
    for (const size of TEXT_SIZES) {
      const { attributes } = bootWith(size);
      if (size === "default") expect(attributes[TEXT_SIZE_ATTRIBUTE], size).toBeUndefined();
      else expect(attributes[TEXT_SIZE_ATTRIBUTE], size).toBe(size);
    }
    expect(bootWith("huge").attributes[TEXT_SIZE_ATTRIBUTE]).toBeUndefined();
  });

  it("sizes the root by the store's percents", () => {
    const rules = Object.fromEntries(
      [...css.matchAll(/html\[data-text-size="([a-z-]+)"\]\s*\{\s*font-size:\s*([\d.]+)%;\s*\}/g)].map((match) => [
        match[1],
        Number(match[2]),
      ]),
    );
    const expected = Object.fromEntries(
      TEXT_SIZES.filter((size) => size !== "default").map((size) => [size, TEXT_SIZE_ROOT_PERCENT[size]]),
    );
    expect(rules).toEqual(expected);
    expect(TEXT_SIZE_ROOT_PERCENT.default).toBe(100);
  });
});
