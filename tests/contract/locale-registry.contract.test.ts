import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { LOCALE_META, LOCALE_NAME_KEY } from "@/i18n/locales";
import { routing } from "@/i18n/routing";

describe("locale registry", () => {
  it("has metadata and a name key for exactly the routing locales", () => {
    const locales = [...routing.locales].sort();
    expect(Object.keys(LOCALE_META).sort()).toEqual(locales);
    expect(Object.keys(LOCALE_NAME_KEY).sort()).toEqual(locales);
  });

  it.each(routing.locales)("%s has a messages directory", (code) => {
    const dir = join(process.cwd(), "messages", code);
    expect(existsSync(dir) && statSync(dir).isDirectory()).toBe(true);
  });

  it.each(routing.locales)("%s has canonical language tags", (code) => {
    const meta = LOCALE_META[code];
    for (const tag of [meta.htmlLang, meta.hreflang, meta.intlTag]) {
      expect(Intl.getCanonicalLocales(tag)).toEqual([tag]);
    }
    expect(meta.ogLocale).toMatch(/^[a-z]{2}_[A-Z]{2}$/);
  });

  it("gives every locale a unique hreflang", () => {
    const tags = routing.locales.map((code) => LOCALE_META[code].hreflang);
    expect(new Set(tags).size).toBe(tags.length);
  });
});
